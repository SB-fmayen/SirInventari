import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTiempoReal } from '@/hooks/useTiempoReal'
import { io } from 'socket.io-client'

const falso = vi.hoisted(() => ({
  centroId: 1,
  eventos: new Map<string, () => void>(),
  conectar: vi.fn(), desconectar: vi.fn(),
}))
vi.mock('@/sesion/SesionProvider', () => ({ useSesion: () => ({ centro: { id: falso.centroId } }) }))
vi.mock('@/lib/firebase', () => ({ obtenerToken: async () => 'token-prueba' }))
vi.mock('socket.io-client', () => ({ io: vi.fn(() => ({
  connected: false,
  on: (evento: string, accion: () => void) => { falso.eventos.set(evento, accion) },
  connect: falso.conectar, disconnect: falso.desconectar,
})) }))
beforeEach(() => { vi.clearAllMocks(); falso.eventos.clear(); falso.centroId = 1 })
afterEach(() => { vi.useRealTimers() })

describe('Conexión en tiempo real', () => {
  it('envía token y centro y recarga al conectar o recibir cambios', async () => {
    const recargar = vi.fn()
    const { result, unmount } = renderHook(() => useTiempoReal(recargar))
    expect(falso.conectar).toHaveBeenCalledOnce()
    const opciones = vi.mocked(io).mock.calls[0][1]!
    const auth = opciones.auth as (responder: (datos: unknown) => void) => void
    const responder = vi.fn(); auth(responder)
    await waitFor(() => expect(responder).toHaveBeenCalledWith({ token: 'token-prueba', centro_id: 1 }))
    act(() => falso.eventos.get('connect')!())
    expect(result.current).toBe(true)
    expect(recargar).toHaveBeenCalledTimes(1)
    act(() => falso.eventos.get('pedido:actualizado')!())
    expect(recargar).toHaveBeenCalledTimes(2)
    unmount(); expect(falso.desconectar).toHaveBeenCalledOnce()
  })

  it('al perder conexión avisa y reintenta; cambiar centro desconecta la sala anterior', () => {
    vi.useFakeTimers()
    const { result, rerender, unmount } = renderHook(() => useTiempoReal(vi.fn()))
    act(() => falso.eventos.get('connect')!())
    act(() => falso.eventos.get('disconnect')!())
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(10000))
    expect(falso.conectar).toHaveBeenCalledTimes(2)
    falso.centroId = 2
    rerender()
    expect(falso.desconectar).toHaveBeenCalledTimes(1)
    expect(io).toHaveBeenCalledTimes(2)
    unmount()
    act(() => vi.advanceTimersByTime(10000))
    expect(falso.conectar).toHaveBeenCalledTimes(3)
  })
})
