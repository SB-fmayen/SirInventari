import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'

// Configuración web de Firebase: viene del .env de la raíz (VITE_FIREBASE_*)
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
})

const auth = getAuth(app)
auth.languageCode = 'es'
// La sesión queda guardada en el navegador: sigue abierta al recargar la página
const persistenciaLista = setPersistence(auth, browserLocalPersistence)

export type UsuarioFirebase = User

export async function iniciarSesion(correo: string, contrasena: string): Promise<void> {
  await persistenciaLista
  await signInWithEmailAndPassword(auth, correo.trim(), contrasena)
}

export async function cerrarSesion(): Promise<void> {
  await signOut(auth)
}

/** Avisa cada vez que cambia la sesión (al abrir la app, al entrar y al salir). */
export function escucharSesion(alCambiar: (usuario: UsuarioFirebase | null) => void): () => void {
  return onAuthStateChanged(auth, alCambiar)
}

/** Token actual para mandarlo a la API. Firebase lo renueva solo cuando está por vencer. */
export async function obtenerToken(): Promise<string | null> {
  return (await auth.currentUser?.getIdToken()) ?? null
}

/** Mensajes en español para los errores de Firebase al iniciar sesión. */
export function mensajeErrorFirebase(error: unknown): string {
  const codigo = (error as { code?: string } | null)?.code ?? ''
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Correo o contraseña incorrectos.'
    case 'auth/invalid-email':
      return 'El correo no tiene un formato válido.'
    case 'auth/missing-password':
      return 'Escribe tu contraseña.'
    case 'auth/user-disabled':
      return 'Tu usuario está desactivado. Habla con el administrador.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'
    case 'auth/network-request-failed':
      return 'No hay conexión a internet. Revisa la red e intenta de nuevo.'
    default:
      return 'No se pudo iniciar sesión. Intenta de nuevo.'
  }
}
