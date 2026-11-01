/** Dirección de la API. Se configura con VITE_API_URL en el .env de la raíz del proyecto. */
export const URL_API = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Error que devuelve la API: siempre trae un mensaje en español. */
export class ErrorApi extends Error {
  readonly status: number
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

/**
 * Llama a una ruta de la API. Si se pasa un token, lo envía como "Bearer".
 * Si la API responde con error, lanza ErrorApi con su mensaje en español.
 */
export async function pedirApi<T>(ruta: string, token: string | null, opciones: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${URL_API}${ruta}`, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opciones.headers,
      },
    })
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar con la API. Revisa el internet o que la API esté encendida.')
  }
  const cuerpo: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const mensaje = (cuerpo as { mensaje?: string } | null)?.mensaje ?? 'Ocurrió un error inesperado.'
    throw new ErrorApi(res.status, mensaje)
  }
  return cuerpo as T
}

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
