import { useContext, useEffect } from 'react'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router'
import {
  confirmarSalida,
  hayCambiosSinGuardar,
  usarProteccionRouter,
} from '@/hooks/useCambiosSinGuardar'

export function ProteccionNavegacion() {
  const router = useContext(UNSAFE_DataRouterContext)
  return router ? <BloqueoRutas /> : null
}
function BloqueoRutas() {
  const bloqueo = useBlocker(() => hayCambiosSinGuardar())
  useEffect(() => {
    usarProteccionRouter(true)
    return () => usarProteccionRouter(false)
  }, [])
  useEffect(() => {
    if (bloqueo.state === 'blocked') {
      if (confirmarSalida()) bloqueo.proceed()
      else bloqueo.reset()
    }
  }, [bloqueo])
  return null
}
