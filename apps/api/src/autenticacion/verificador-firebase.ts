import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

/** Lo que la API necesita saber de un token de Firebase ya verificado. */
export interface TokenVerificado {
  uid: string;
  email?: string;
}

/** ¿Hay cuenta de servicio configurada? Sin ella solo se pueden verificar tokens. */
export function hayCuentaDeServicio(): boolean {
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

let appFirebase: App | undefined;

/** App de Firebase Admin compartida por toda la API. */
export function obtenerAuthFirebase(): Auth {
  if (!appFirebase) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error('Falta FIREBASE_PROJECT_ID en el archivo .env');
    }
    appFirebase =
      getApps().find((a) => a.name === 'sirinventari') ??
      initializeApp(
        { projectId, ...(hayCuentaDeServicio() ? { credential: applicationDefault() } : {}) },
        'sirinventari',
      );
    new Logger('Firebase').log(
      `Proyecto ${projectId}${hayCuentaDeServicio() ? ' (con cuenta de servicio)' : ' (solo verificación de tokens)'}`,
    );
  }
  return getAuth(appFirebase);
}

/**
 * Verifica los tokens de Firebase Authentication.
 * Basta el ID del proyecto (FIREBASE_PROJECT_ID). Revisar si una sesión fue revocada
 * necesita la cuenta de servicio, así que solo se hace cuando está configurada.
 */
@Injectable()
export class VerificadorFirebase {
  async verificar(token: string): Promise<TokenVerificado> {
    const decodificado = await obtenerAuthFirebase().verifyIdToken(token, hayCuentaDeServicio());
    return { uid: decodificado.uid, email: decodificado.email };
  }
}

export const MENSAJE_SIN_CUENTA_SERVICIO =
  'Para crear usuarios en Firebase desde aquí falta configurar la cuenta de servicio ' +
  '(GOOGLE_APPLICATION_CREDENTIALS). Mientras tanto, crea el usuario en la consola de Firebase ' +
  'y escribe aquí su UID.';

/** Crea, desactiva y reactiva usuarios en Firebase (necesita la cuenta de servicio). */
@Injectable()
export class GestorUsuariosFirebase {
  private readonly logger = new Logger('Firebase');

  private auth(): Auth {
    if (!hayCuentaDeServicio()) {
      throw new ServiceUnavailableException(MENSAJE_SIN_CUENTA_SERVICIO);
    }
    return obtenerAuthFirebase();
  }

  /** Crea el usuario en Firebase o, si el correo ya existe allí, devuelve su UID. */
  async crearOObtener(email: string, contrasena: string, nombre: string): Promise<{ uid: string; creado: boolean }> {
    const auth = this.auth();
    try {
      const nuevo = await auth.createUser({ email, password: contrasena, displayName: nombre });
      return { uid: nuevo.uid, creado: true };
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/email-already-exists') {
        const existente = await auth.getUserByEmail(email);
        return { uid: existente.uid, creado: false };
      }
      throw error;
    }
  }

  /** Se usa para deshacer la creación si falla el registro en la base. */
  async borrar(uid: string): Promise<void> {
    await this.auth().deleteUser(uid);
  }

  /** Bloquea o desbloquea el usuario en Firebase. Si no hay cuenta de servicio, no hace nada. */
  async cambiarActivo(uid: string, activo: boolean): Promise<void> {
    if (!hayCuentaDeServicio()) return;
    try {
      const auth = obtenerAuthFirebase();
      await auth.updateUser(uid, { disabled: !activo });
      if (!activo) await auth.revokeRefreshTokens(uid);
    } catch (error) {
      // La base es la que manda: aunque Firebase falle, el usuario queda sin acceso en la API
      this.logger.warn(`No se pudo actualizar el usuario ${uid} en Firebase: ${String(error)}`);
    }
  }
}
