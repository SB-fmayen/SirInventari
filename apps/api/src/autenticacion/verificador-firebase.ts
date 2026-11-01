import { Injectable, Logger } from '@nestjs/common';
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/** Lo que la API necesita saber de un token de Firebase ya verificado. */
export interface TokenVerificado {
  uid: string;
  email?: string;
}

/**
 * Verifica los tokens de Firebase Authentication con Firebase Admin.
 * Para verificar tokens basta el ID del proyecto (FIREBASE_PROJECT_ID).
 * Si existe GOOGLE_APPLICATION_CREDENTIALS (cuenta de servicio), también se usa;
 * esa clave hará falta para crear usuarios en Firebase desde la API (Tarea 5).
 */
@Injectable()
export class VerificadorFirebase {
  private readonly logger = new Logger('Firebase');
  private app?: App;

  private obtenerApp(): App {
    if (this.app) return this.app;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error('Falta FIREBASE_PROJECT_ID en el archivo .env');
    }
    const existente = getApps().find((a) => a.name === 'sirinventari');
    this.app =
      existente ??
      initializeApp(
        {
          projectId,
          ...(process.env.GOOGLE_APPLICATION_CREDENTIALS
            ? { credential: applicationDefault() }
            : {}),
        },
        'sirinventari',
      );
    this.logger.log(`Verificando tokens del proyecto ${projectId}`);
    return this.app;
  }

  /** Devuelve los datos del token o lanza un error si no es válido o ya venció. */
  async verificar(token: string): Promise<TokenVerificado> {
    const decodificado = await getAuth(this.obtenerApp()).verifyIdToken(token, true);
    return { uid: decodificado.uid, email: decodificado.email };
  }
}
