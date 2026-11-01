import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ErrorApi, pedirApi } from '@/lib/api'
import { cerrarSesion, escucharSesion, iniciarSesion, obtenerToken } from '@/lib/firebase'
import type { CentroVenta, EstadoSesion, UsuarioSistema } from './tipos'

interface ContextoSesion {
  estado: EstadoSesion
  /** Centro de venta elegido (solo ve los datos de ese centro). */
  centro: CentroVenta | null
  entrar: (correo: string, contrasena: string) => Promise<void>
  salir: () => Promise<void>
  reintentar: () => void
  elegirCentro: (id: number) => void
  cambiarCentro: () => void
  /** Llama a la API con el token y el centro elegido. */
  api: <T>(ruta: string, opciones?: RequestInit) => Promise<T>
}

const Contexto = createContext<ContextoSesion | null>(null)

const claveCentro = (usuarioId: number) => `sirinventari.centro.${usuarioId}`

/** Centro guardado para este usuario, si todavía es uno de sus centros. Con un solo centro, ese. */
function centroInicial(usuario: UsuarioSistema): CentroVenta | null {
  if (usuario.centros.length === 1) return usuario.centros[0]
  const guardado = Number(localStorage.getItem(claveCentro(usuario.id)))
  return usuario.centros.find((c) => c.id === guardado) ?? null
}

/**
 * Maneja la sesión: Firebase dice quién inició sesión y la API (GET /sesion)
 * dice si ese usuario tiene acceso, con su rol y sus centros.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' })
  const [centro, setCentro] = useState<CentroVenta | null>(null)
  const [intento, setIntento] = useState(0)

  const cargarUsuario = useCallback(async (vigente: () => boolean) => {
    try {
      const usuario = await pedirApi<UsuarioSistema>('/sesion', await obtenerToken())
      if (!vigente()) return
      setCentro(centroInicial(usuario))
      setEstado({ tipo: 'activa', usuario })
    } catch (error) {
      if (!vigente()) return
      if (error instanceof ErrorApi && error.status === 401) {
        // Token vencido o inválido: hay que entrar de nuevo
        await cerrarSesion()
        return
      }
      const mensaje =
        error instanceof ErrorApi ? error.message : 'No se pudo revisar tu acceso. Intenta de nuevo.'
      setEstado({ tipo: 'sin-acceso', mensaje })
    }
  }, [])

  useEffect(() => {
    let activo = true
    let revision = 0
    const dejarDeEscuchar = escucharSesion((usuarioFirebase) => {
      const actual = ++revision
      if (!usuarioFirebase) {
        setCentro(null)
        setEstado({ tipo: 'sin-sesion' })
        return
      }
      setEstado({ tipo: 'cargando' })
      void cargarUsuario(() => activo && actual === revision)
    })
    return () => {
      activo = false
      dejarDeEscuchar()
    }
  }, [cargarUsuario, intento])

  const elegirCentro = useCallback(
    (id: number) => {
      if (estado.tipo !== 'activa') return
      const elegido = estado.usuario.centros.find((c) => c.id === id)
      if (!elegido) return
      localStorage.setItem(claveCentro(estado.usuario.id), String(id))
      setCentro(elegido)
    },
    [estado],
  )

  const cambiarCentro = useCallback(() => {
    if (estado.tipo === 'activa') localStorage.removeItem(claveCentro(estado.usuario.id))
    setCentro(null)
  }, [estado])

  const api = useCallback(
    async <T,>(ruta: string, opciones: RequestInit = {}): Promise<T> =>
      pedirApi<T>(ruta, await obtenerToken(), {
        ...opciones,
        headers: { ...(centro ? { 'X-Centro-Id': String(centro.id) } : {}), ...opciones.headers },
      }),
    [centro],
  )

  const valor = useMemo<ContextoSesion>(
    () => ({
      estado,
      centro,
      entrar: iniciarSesion,
      salir: cerrarSesion,
      reintentar: () => setIntento((n) => n + 1),
      elegirCentro,
      cambiarCentro,
      api,
    }),
    [estado, centro, elegirCentro, cambiarCentro, api],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion(): ContextoSesion {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useSesion debe usarse dentro de <SesionProvider>')
  return contexto
}
