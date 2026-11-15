import Dexie, { type Table } from 'dexie'

/**
 * Fase 3 · Datos guardados en el dispositivo (IndexedDB con Dexie).
 *  · datos: copia del usuario, el menú con precios, los tipos de venta y el dispositivo elegido.
 *  · cola: operaciones hechas sin internet, en el orden en que se hicieron (Tarea 18).
 */
export interface Dato { clave: string; valor: unknown; guardado_en: string }
export type TipoOperacion = 'PEDIDO' | 'PAGO'
export interface OperacionCola {
  orden?: number
  id: string                 // UUID de la operación (no se repite al reenviar)
  centro_id: number
  usuario_id: number
  tipo: TipoOperacion
  datos: Record<string, unknown>
  creado_en: string          // hora real del dispositivo
  estado: 'PENDIENTE' | 'ENVIANDO' | 'APLICADO' | 'YA_EXISTIA' | 'CONFLICTO'
  resultado?: Record<string, unknown>
  intentos: number
  ultimo_error?: string
}

class BaseLocal extends Dexie {
  datos!: Table<Dato, string>
  cola!: Table<OperacionCola, number>
  constructor() {
    super('sirinventari')
    this.version(1).stores({ datos: 'clave', cola: '++orden, id, [centro_id+estado], estado' })
  }
}
export const baseLocal = new BaseLocal()

export async function guardarDato(clave: string, valor: unknown): Promise<void> {
  try { await baseLocal.datos.put({ clave, valor, guardado_en: new Date().toISOString() }) } catch { /* sin almacenamiento: se sigue sin copia */ }
}
export async function leerDato<T>(clave: string): Promise<{ valor: T; guardado_en: string } | null> {
  try {
    const d = await baseLocal.datos.get(clave)
    return d ? { valor: d.valor as T, guardado_en: d.guardado_en } : null
  } catch { return null }
}

/** Rutas GET que se guardan para poder vender sin internet. */
export const RUTAS_GUARDADAS = ['/pedidos/catalogo', '/pedidos/tipos', '/caja/metodos', '/dispositivos']
export const claveRuta = (centroId: number | undefined, ruta: string) => `ruta:${centroId ?? 0}:${ruta}`
export const claveSesion = (uid: string) => `sesion:${uid}`
export const claveDispositivo = (centroId: number) => `dispositivo:${centroId}`

/** Dispositivo elegido en esta tablet/caja para un centro (CAJA1, TAB01…). */
export interface DispositivoLocal { id: number; codigo: string; nombre: string; tipo: string }
export async function dispositivoActual(centroId: number): Promise<DispositivoLocal | null> {
  return (await leerDato<DispositivoLocal>(claveDispositivo(centroId)))?.valor ?? null
}
