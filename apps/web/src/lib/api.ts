/** Dirección de la API. Se configura con VITE_API_URL en el .env de la raíz del proyecto. */
export const URL_API = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Lo que responde GET /salud. */
export interface RespuestaSalud {
  api: 'ok'
  baseDatos: 'ok' | 'error'
  fechaOperacion: string | null
  zonaHoraria: string
  mensaje: string
}

/**
 * Consulta GET /salud. La API responde 503 (con el mismo formato) cuando la base no contesta,
 * así que se lee el cuerpo aunque el código no sea 200.
 * Lanza un error si no hay respuesta de la API.
 */
export async function consultarSalud(signal?: AbortSignal): Promise<RespuestaSalud> {
  const res = await fetch(`${URL_API}/salud`, { signal, cache: 'no-store' })
  const cuerpo = (await res.json()) as Partial<RespuestaSalud>
  if (cuerpo.api !== 'ok') {
    throw new Error('La API respondió algo inesperado')
  }
  return cuerpo as RespuestaSalud
}
