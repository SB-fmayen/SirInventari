import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { RETIRAR_WORKER_DESARROLLO } from '../../pwa-desarrollo'

describe('Actualizar una PWA anterior al volver a desarrollo', () => {
  it('retira el registro y recarga las pestañas controladas sin borrar datos locales', async () => {
    const eventos = new Map<string, (evento: { waitUntil: (promesa: Promise<unknown>) => void }) => void>()
    const navegar = vi.fn(async () => {})
    const retirar = vi.fn(async () => true)
    const borrarCache = vi.fn()
    const esperar = vi.fn(async () => {})
    runInNewContext(RETIRAR_WORKER_DESARROLLO, { self: {
      addEventListener: (nombre: string, accion: (evento: { waitUntil: (promesa: Promise<unknown>) => void }) => void) => eventos.set(nombre, accion),
      skipWaiting: esperar,
      registration: { unregister: retirar },
      clients: { matchAll: async () => [{ url: 'http://localhost:5173/pedidos', navigate: navegar }] },
      caches: { delete: borrarCache },
    } })
    let tarea: Promise<unknown> | undefined
    const evento = { waitUntil: (promesa: Promise<unknown>) => { tarea = promesa } }
    eventos.get('install')!(evento); await tarea
    expect(esperar).toHaveBeenCalledOnce()
    eventos.get('activate')!(evento); await tarea
    expect(retirar).toHaveBeenCalledOnce()
    expect(navegar).toHaveBeenCalledWith('http://localhost:5173/pedidos')
    expect(borrarCache).not.toHaveBeenCalled()
  })
})
