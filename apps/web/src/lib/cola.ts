import { ErrorApi } from '@/lib/api'
import { baseLocal, dispositivoActual, type OperacionCola, type TipoOperacion } from '@/lib/sinConexion'

/**
 * Tarea 18 · Cola de ventas hechas sin internet.
 * Todo se guarda en el orden en que se hizo (el pedido siempre antes que su pago)
 * y se envía solo al volver la conexión. Reenviar es seguro: cada operación tiene su UUID.
 */
export const EVENTO_COLA = 'sirinventari-cola'
const avisar = () => { try { window.dispatchEvent(new Event(EVENTO_COLA)) } catch { /* sin ventana */ } }

/** Folio provisional del equipo: CAJA1-0001, CAJA1-0002… (no se repite aunque se recargue la app). */
export async function siguienteFolioProvisional(codigo: string): Promise<string> {
  const clave = `contador:${codigo}`
  const numero = await baseLocal.transaction('rw', baseLocal.datos, async () => {
    const actual = Number((await baseLocal.datos.get(clave))?.valor ?? 0) + 1
    await baseLocal.datos.put({ clave, valor: actual, guardado_en: new Date().toISOString() })
    return actual
  })
  return `${codigo}-${String(numero).padStart(4, '0')}`
}

export async function encolar(op: { id: string; centro_id: number; usuario_id: number; tipo: TipoOperacion; datos: Record<string, unknown> }): Promise<void> {
  await baseLocal.cola.add({ ...op, creado_en: new Date().toISOString(), estado: 'PENDIENTE', intentos: 0 })
  avisar()
}

export async function operacionesDelCentro(centroId: number): Promise<OperacionCola[]> {
  return (await baseLocal.cola.orderBy('orden').toArray()).filter(o => o.centro_id === centroId)
}

type Api = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
interface RespuestaSync { resultados: { id: string; tipo: TipoOperacion; resultado: string; folio?: number | null; motivo?: string }[] }
let enCurso: Promise<number> | null = null

/** Envía lo pendiente del centro, en orden. Devuelve cuántas operaciones se enviaron. */
export function sincronizar(api: Api, centroId: number): Promise<number> {
  enCurso ??= (async () => {
    try {
      const dispositivo = await dispositivoActual(centroId)
      if (!dispositivo) return 0
      const pendientes = (await operacionesDelCentro(centroId)).filter(o => o.estado === 'PENDIENTE' || o.estado === 'ENVIANDO').slice(0, 50)
      if (!pendientes.length) return 0
      let r: RespuestaSync
      try {
        r = await api<RespuestaSync>('/sincronizacion', { method: 'POST', body: JSON.stringify({ dispositivo_id: dispositivo.id, operaciones: pendientes.map(o => ({ tipo: o.tipo, datos: o.datos })) }) })
      } catch (error) {
        const sinRed = error instanceof ErrorApi && error.status === 0
        await baseLocal.cola.bulkPut(pendientes.map(o => ({ ...o, intentos: o.intentos + 1, ultimo_error: sinRed ? undefined : error instanceof Error ? error.message : 'No se pudo enviar.' })))
        avisar()
        return 0
      }
      await baseLocal.transaction('rw', baseLocal.cola, async () => {
        for (const [i, o] of pendientes.entries()) {
          const res = r.resultados[i]
          if (!res) continue
          const estado: OperacionCola['estado'] = res.resultado === 'APLICADO' ? 'APLICADO' : res.resultado === 'YA_EXISTIA' ? 'YA_EXISTIA' : 'CONFLICTO'
          await baseLocal.cola.put({ ...o, estado, resultado: res as unknown as Record<string, unknown>, intentos: o.intentos + 1, ultimo_error: undefined })
        }
      })
      avisar()
      return pendientes.length
    } finally { enCurso = null }
  })()
  return enCurso
}

/** Quita del equipo lo que ya llegó a la nube hace más de un día (los conflictos quedan para revisar). */
export async function limpiarEnviados(): Promise<void> {
  const limite = Date.now() - 86400000
  const viejos = (await baseLocal.cola.toArray()).filter(o => (o.estado === 'APLICADO' || o.estado === 'YA_EXISTIA') && Date.parse(o.creado_en) < limite)
  await baseLocal.cola.bulkDelete(viejos.map(o => o.orden!))
}
