import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ErrorApi, pedirApi } from '@/lib/api'
import { cerrarSesion, escucharSesion, iniciarSesion, obtenerToken } from '@/lib/firebase'
import type { EstadoSesion, UsuarioSistema } from './tipos'

interface ContextoSesion {
  estado: EstadoSesion
  entrar: (correo: string, contrasena: string) => Promise<void>
  salir: () => Promise<void>
  reintentar: () => void
}

const Contexto = createContext<ContextoSesion | null>(null)

/**
 * Maneja la sesión: Firebase dice quién inició sesión y la API (GET /sesion)
 * dice si ese usuario tiene acceso, con su rol y sus centros.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)

  const cargarUsuario = useCallback(async () => {
    try {
      const usuario = await pedirApi<UsuarioSistema>('/sesion', await obtenerToken())
      setEstado({ tipo: 'activa', usuario })
    } catch (error) {
      const mensaje =
        error instanceof ErrorApi ? error.message : 'No se pudo revisar tu acceso. Intenta de nuevo.'
      if (error instanceof ErrorApi && error.status === 401) {
        // Token vencido o inválido: hay que entrar de nuevo
        await cerrarSesion()
        return
      }
      setEstado({ tipo: 'sin-acceso', mensaje })
    }
  }, [])

  useEffect(() => {
    return escucharSesion((usuarioFirebase) => {
      if (!usuarioFirebase) {
        setEstado({ tipo: 'sin-sesion' })
        return
      }
      setEstado({ tipo: 'cargando' })
      void cargarUsuario()
    })
  }, [cargarUsuario, intento])

  const valor = useMemo<ContextoSesion>(
    () => ({
      estado,
      entrar: iniciarSesion,
      salir: cerrarSesion,
      reintentar: () => setIntento((n) => n + 1),
    }),
    [estado],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion(): ContextoSesion {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useSesion debe usarse dentro de <SesionProvider>')
  return contexto
}
