import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { EVENTO_COLA, limpiarEnviados, operacionesDelCentro, sincronizar } from '@/lib/cola'
import type { OperacionCola } from '@/lib/sinConexion'

/** Lista de la cola del centro y envío automático al volver el internet (cada 20 s y con el evento online). */
export function useColaSinInternet({ automatico = false } = {}) {
  const { api, centro } = useSesion()
  const [operaciones, setOperaciones] = useState<OperacionCola[]>([])
  const [enviando, setEnviando] = useState(false)
  const centroId = centro?.id
  const leer = useCallback(async () => { if (centroId) setOperaciones(await operacionesDelCentro(centroId).catch(() => [])) }, [centroId])
  const enviar = useCallback(async () => {
    if (!centroId) return
    setEnviando(true)
    try { await sincronizar(api, centroId) } finally { setEnviando(false) }
  }, [api, centroId])

  useEffect(() => {
    void leer()
    window.addEventListener(EVENTO_COLA, leer)
    return () => window.removeEventListener(EVENTO_COLA, leer)
  }, [leer])

  useEffect(() => {
    if (!automatico || !centroId) return
    const intentar = () => { void sincronizar(api, centroId).catch(() => 0) }
    void limpiarEnviados().catch(() => undefined)
    intentar()
    window.addEventListener('online', intentar)
    const reloj = window.setInterval(intentar, 20000)
    return () => { window.removeEventListener('online', intentar); window.clearInterval(reloj) }
  }, [automatico, api, centroId])

  const pendientes = operaciones.filter(o => o.estado === 'PENDIENTE' || o.estado === 'ENVIANDO').length
  const conflictos = operaciones.filter(o => o.estado === 'CONFLICTO').length
  return { operaciones, pendientes, conflictos, enviando, enviar }
}
