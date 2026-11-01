import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cocina } from '@/paginas/Cocina'
import { Pedidos } from '@/paginas/Pedidos'
import { Caja } from '@/paginas/Caja'
import { ErrorApi } from '@/lib/api'

const simulado = vi.hoisted(() => ({ api: vi.fn(), conectado: true, actualizar: null as null | (() => Promise<void>) }))
vi.mock('@/sesion/SesionProvider', () => ({ useSesion: () => ({ api: simulado.api, centro: { id: 1, nombre: 'Centro prueba' } }) }))
vi.mock('@/hooks/useTiempoReal', () => ({ useTiempoReal: (actualizar: () => Promise<void>) => { simulado.actualizar = actualizar; return simulado.conectado } }))

const inicial = () => ({
  id: 'pedido-cocina', folio: 7, fecha_operacion: '2026-11-01', creado_en: '2026-11-01T18:00:00Z', estado_cocina: 'PENDIENTE', version: 2,
  mesa_referencia: 'Mesa 4', cliente_nombre: null, tipo_venta: { nombre: 'Consumo en mesa' },
  pedido_detalle: [{ id: 'linea-1', cantidad: '2', notas: 'Sin cebolla', agregado_en: '2026-11-01T18:00:00Z', nuevo: false, producto: { nombre: 'Shuko americano' } }],
})
let lista: ReturnType<typeof inicial>[]
beforeEach(() => {
  lista = [inicial()]; simulado.conectado = true; simulado.actualizar = null; simulado.api.mockReset()
  simulado.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
    if (ruta === '/cocina') return structuredClone(lista)
    if (ruta === '/cocina/pedido-cocina/estado') {
      const datos = JSON.parse(String(opciones?.body))
      lista[0].estado_cocina = datos.estado_cocina
      return structuredClone(lista[0])
    }
    throw new Error(`Ruta inesperada: ${ruta}`)
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('Pantalla Cocina', () => {
  it('muestra folio, mesa, tipo, fecha de Guatemala, notas y minutos de espera', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-01T18:05:00Z').getTime())
    render(<Cocina />)
    const tarjeta = await screen.findByRole('article', { name: 'Pedido 7' })
    expect(tarjeta).toHaveTextContent('Mesa 4')
    expect(tarjeta).toHaveTextContent('Consumo en mesa · 01/11/2026 · 12:00')
    expect(tarjeta).toHaveTextContent('5 min de espera')
    expect(tarjeta).toHaveTextContent('2 × Shuko americano')
    expect(tarjeta).toHaveTextContent('Notas: Sin cebolla')
    expect(tarjeta).not.toHaveTextContent('NUEVO')
  })

  it('un aviso agrega productos NUEVO y pedidos sin recargar; al reconectar recupera la lista', async () => {
    const vista = render(<Cocina />)
    await screen.findByRole('article', { name: 'Pedido 7' })
    lista[0].pedido_detalle.push({ id: 'linea-2', cantidad: '1', notas: 'Bien tostado', agregado_en: '2026-11-01T18:03:00Z', nuevo: true, producto: { nombre: 'Shuko grande' } })
    lista.push({ ...inicial(), id: 'pedido-8', folio: 8 })
    await act(async () => { await simulado.actualizar!() })
    expect(screen.getByRole('article', { name: 'Pedido 7' })).toHaveTextContent('NUEVO')
    expect(screen.getByRole('article', { name: 'Pedido 8' })).toBeInTheDocument()
    simulado.conectado = false; vista.rerender(<Cocina />)
    expect(screen.getByText(/Sin conexión en tiempo real/)).toBeInTheDocument()
    lista = []; simulado.conectado = true
    await act(async () => { await simulado.actualizar!() }); vista.rerender(<Cocina />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByText(/Cocina conectada en tiempo real/)).toBeInTheDocument()
  })

  it('avanza por preparación, listo y entregado; permite consultar entregados de hoy', async () => {
    const usuario = userEvent.setup(); render(<Cocina />)
    await usuario.click(await screen.findByRole('button', { name: 'Empezar preparación: pedido 7' }))
    expect(await screen.findByRole('button', { name: 'Marcar listo: pedido 7' })).toBeInTheDocument()
    expect(simulado.api).toHaveBeenCalledWith('/cocina/pedido-cocina/estado', expect.objectContaining({ body: JSON.stringify({ estado_actual: 'PENDIENTE', estado_cocina: 'EN_PREPARACION', version_actual: 2 }) }))
    await usuario.click(screen.getByRole('button', { name: 'Marcar listo: pedido 7' }))
    await usuario.click(await screen.findByRole('button', { name: 'Marcar entregado: pedido 7' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Pedido 7' })).not.toBeInTheDocument())
    await usuario.click(screen.getByRole('checkbox', { name: /Mostrar entregados/ }))
    expect(within(screen.getByRole('region', { name: 'Entregados hoy' })).getByRole('article', { name: 'Pedido 7' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pedido 7/ })).not.toBeInTheDocument()
  })

  it('un conflicto actualiza el estado y muestra el error sin confirmar un cambio fallido', async () => {
    render(<Cocina />)
    const boton = await screen.findByRole('button', { name: 'Empezar preparación: pedido 7' })
    simulado.api.mockImplementation(async (ruta: string) => {
      if (ruta === '/cocina') return [{ ...inicial(), estado_cocina: 'LISTO' }]
      throw new ErrorApi(409, 'El estado de cocina cambió. Actualiza el pedido antes de continuar.')
    })
    fireEvent.click(boton)
    expect(await screen.findByRole('alert')).toHaveTextContent('El estado de cocina cambió')
    expect(await screen.findByRole('button', { name: 'Marcar entregado: pedido 7' })).toBeInTheDocument()
    expect(screen.queryByText('Pedido 7: En preparación.')).not.toBeInTheDocument()
  })

  it('no sobrescribe una lista nueva con una respuesta antigua', async () => {
    let resolver!: (valor: unknown) => void
    simulado.api.mockReturnValueOnce(new Promise(resolve => { resolver = resolve }))
    render(<Cocina />)
    await act(async () => { await simulado.actualizar!() })
    expect(screen.getByRole('article', { name: 'Pedido 7' })).toBeInTheDocument()
    await act(async () => { resolver([]) })
    expect(screen.getByRole('article', { name: 'Pedido 7' })).toBeInTheDocument()
  })
})

describe('Preparación visible en Pedidos y Caja', () => {
  const pedido = () => ({ ...inicial(), tipo_venta_id: 1, estado: 'ABIERTO', total: '45', pagado: '0.00', saldo: '45.00', usuario: { nombre: 'Mesera' }, pedido_detalle: [] })
  it('el mesero recibe el estado de cocina en la lista y el pedido seleccionado', async () => {
    let p = pedido()
    simulado.api.mockImplementation(async (ruta: string) => ruta === '/pedidos' ? [p] : [])
    render(<Pedidos />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver pedido 7' }))
    p = { ...p, estado_cocina: 'LISTO' }
    await act(async () => { await simulado.actualizar!() })
    expect(screen.getAllByText('Cocina: Listo')).toHaveLength(2)
  })
  it('Caja actualiza preparación del pedido seleccionado sin cambiar el monto escrito', async () => {
    let p = pedido()
    simulado.api.mockImplementation(async (ruta: string) => {
      if (ruta === '/caja/pendientes') return [p]
      if (ruta === '/caja/metodos') return [{ id: 1, codigo: 'EFECTIVO', nombre: 'Efectivo', requiere_terminal: false, requiere_referencia: false }]
      if (ruta === '/turnos') return [{ estado: 'ABIERTO' }]
      if (ruta === '/caja/pedidos/pedido-cocina/comprobante') return { centro: { nombre: 'Centro prueba' }, pedido: p, pagos: [] }
      throw new Error(`Ruta inesperada: ${ruta}`)
    })
    render(<Caja />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cobrar pedido 7' }))
    const monto = await screen.findByRole('spinbutton', { name: 'Monto a cobrar' })
    fireEvent.change(monto, { target: { value: '20' } })
    p = { ...p, estado_cocina: 'LISTO' }
    await act(async () => { await simulado.actualizar!() })
    expect(screen.getAllByText('Cocina: Listo')).toHaveLength(2)
    expect(monto).toHaveValue(20)
  })
})
