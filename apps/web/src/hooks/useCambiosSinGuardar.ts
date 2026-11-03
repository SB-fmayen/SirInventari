import { useEffect, useId } from 'react'

const pendientes = new Set<string>()
export function confirmarSalida() {
  return pendientes.size === 0 || window.confirm('Hay cambios sin guardar. ¿Quieres salir y dejarlos sin enviar?')
}

/** Protege recarga, enlaces, cambio de centro y cierre de sesión. */
export function useCambiosSinGuardar(activo: boolean) {
  const id = useId()
  useEffect(() => {
    if (!activo) return
    pendientes.add(id)
    const descargar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const navegar = (e: MouseEvent) => {
      const enlace = e.target instanceof Element ? e.target.closest('a[href]') : null
      if (enlace && enlace.getAttribute('href') !== '#contenido' && !confirmarSalida()) { e.preventDefault(); e.stopPropagation() }
    }
    const historial = () => { if (pendientes.size) window.alert('Hay cambios sin guardar. Puedes recuperar el borrador de un pedido nuevo al volver.') }
    window.addEventListener('beforeunload', descargar)
    document.addEventListener('click', navegar, true)
    window.addEventListener('popstate', historial)
    return () => { pendientes.delete(id); window.removeEventListener('beforeunload', descargar); document.removeEventListener('click', navegar, true); window.removeEventListener('popstate', historial) }
  }, [activo, id])
}
