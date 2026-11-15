import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Auditoria } from '@/paginas/Auditoria'

const sesion = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('@/sesion/SesionProvider', () => ({ useSesion: () => ({ api: sesion.api, centro: { id: 1, nombre: 'Centro 1' }, estado: { tipo: 'activa', usuario: { id: 1, rol: 'GERENTE' } } }) }))

const eventos = [
  { id: '3', fecha: '2026-11-15T20:10:00Z', usuario: 'Luis Cajero', folio: 7, fecha_operacion: '2026-11-15', pedido_id: 'p-7', que: 'Pago', explicacion: 'Cobró Q 45.00 con Efectivo.', antes: null, despues: { monto: '45.00' } },
  { id: '2', fecha: '2026-11-15T20:05:00Z', usuario: 'Ana Mesera', folio: 7, fecha_operacion: '2026-11-15', pedido_id: 'p-7', que: 'Producto del pedido', explicacion: 'Agregó 2 × Limonada a Q 10.00 c/u.', antes: null, despues: {} },
  { id: '1', fecha: '2026-11-15T20:00:00Z', usuario: 'Luis Cajero', folio: 7, fecha_operacion: '2026-11-15', pedido_id: 'p-7', que: 'Pedido', explicacion: 'Creó el pedido para Rosa.', antes: null, despues: {} },
]

describe('Auditoría (Tarea 16)', () => {
  beforeEach(() => {
    sesion.api.mockReset()
    sesion.api.mockImplementation(async (ruta: string) => ruta === '/auditoria/usuarios' ? [{ id: 2, nombre: 'Luis Cajero', rol: 'CAJERO' }] : eventos)
  })

  it('busca por folio y muestra quién creó, agregó y cobró en palabras', async () => {
    render(<Auditoria />)
    await userEvent.type(screen.getByLabelText('Folio del pedido'), '7')
    await userEvent.selectOptions(await screen.findByLabelText('Usuario'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar cambios' }))
    const lista = await screen.findByRole('list', { name: 'Cambios encontrados' })
    expect(within(lista).getByText('Creó el pedido para Rosa.')).toBeInTheDocument()
    expect(within(lista).getByText('Agregó 2 × Limonada a Q 10.00 c/u.')).toBeInTheDocument()
    expect(within(lista).getByText('Cobró Q 45.00 con Efectivo.')).toBeInTheDocument()
    expect(within(lista).getAllByText('Luis Cajero')).toHaveLength(2)
    const ruta = sesion.api.mock.calls.map(([r]) => r as string).find(r => r.startsWith('/auditoria?'))!
    expect(ruta).toContain('folio=7')
    expect(ruta).toContain('usuario=2')
    await userEvent.click(within(lista).getAllByRole('button', { name: 'Ver todo el pedido 7' })[0])
    expect(sesion.api).toHaveBeenCalledWith('/auditoria?pedido=p-7')
  })
})
