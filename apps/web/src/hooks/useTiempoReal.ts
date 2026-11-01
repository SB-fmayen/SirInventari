import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { URL_API } from '@/lib/api'
import { obtenerToken } from '@/lib/firebase'
import { useSesion } from '@/sesion/SesionProvider'

/** Un aviso solo pide recargar: los datos siempre se leen con token y centro en la API. */
export function useTiempoReal(alCambiar: () => void | Promise<void>) {
  const { centro } = useSesion()
  const centroId = centro?.id
  const [conectado, setConectado] = useState(false)
  const oyente = useRef(alCambiar)
  useEffect(() => { oyente.current = alCambiar }, [alCambiar])
  useEffect(() => {
    if (!centroId) return
    const socket = io(`${URL_API}/ventas`, {
      autoConnect: false,
      auth: (responder) => { void obtenerToken().then((token) => responder({ token, centro_id: centroId })).catch(() => responder({ token: null, centro_id: centroId })) },
      reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 10000,
    })
    let vigente = true
    let reintento: ReturnType<typeof setTimeout> | undefined
    const recargar = () => { if (vigente) void Promise.resolve(oyente.current()).catch(() => {}) }
    const reconectar = () => {
      if (!vigente) return
      setConectado(false)
      clearTimeout(reintento)
      reintento = setTimeout(() => { if (vigente && !socket.connected) socket.connect() }, 10000)
    }
    socket.on('connect', () => { if (vigente) { clearTimeout(reintento); setConectado(true); recargar() } })
    socket.on('disconnect', reconectar)
    socket.on('connect_error', reconectar)
    socket.on('pedido:actualizado', recargar)
    socket.connect()
    return () => { vigente = false; clearTimeout(reintento); socket.disconnect() }
  }, [centroId])
  return conectado
}
