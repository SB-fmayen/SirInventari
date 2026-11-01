import { useCallback, useEffect, useRef, useState } from 'react'
import { consultarSalud } from '@/lib/api'

export type EstadoConexion = 'revisando' | 'conectada' | 'sin-base' | 'sin-api'

export interface SaludApi {
  estado: EstadoConexion
  fechaOperacion: string | null
  revisadoEn: Date | null
  revisarAhora: () => void
}

const CADA_MS = 30_000
const ESPERA_MAXIMA_MS = 8_000

/** Revisa GET /salud al abrir la app y cada 30 segundos. */
export function useSaludApi(cadaMs: number = CADA_MS): SaludApi {
  const [estado, setEstado] = useState<EstadoConexion>('revisando')
  const [fechaOperacion, setFechaOperacion] = useState<string | null>(null)
  const [revisadoEn, setRevisadoEn] = useState<Date | null>(null)
  const montado = useRef(true)

  const revisar = useCallback(async () => {
    const control = new AbortController()
    const limite = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS)
    try {
      const salud = await consultarSalud(control.signal)
      if (!montado.current) return
      setEstado(salud.baseDatos === 'ok' ? 'conectada' : 'sin-base')
      setFechaOperacion(salud.fechaOperacion)
    } catch {
      if (!montado.current) return
      setEstado('sin-api')
    } finally {
      clearTimeout(limite)
      if (montado.current) setRevisadoEn(new Date())
    }
  }, [])

  useEffect(() => {
    montado.current = true
    void revisar()
    const intervalo = setInterval(() => void revisar(), cadaMs)
    // Al volver a la pestaña o recuperar la red, revisar de inmediato
    const alVolver = () => void revisar()
    window.addEventListener('online', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      montado.current = false
      clearInterval(intervalo)
      window.removeEventListener('online', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [revisar, cadaMs])

  return { estado, fechaOperacion, revisadoEn, revisarAhora: () => void revisar() }
}
