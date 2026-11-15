import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pedidos } from '@/paginas/Pedidos'
import { ErrorApi } from '@/lib/api'

const sesion = vi.hoisted(() => ({ api: vi.fn(), rol: 'CAJERO', permisos: [] as { modulo: string; accion: string; permitido: boolean }[] }))
vi.mock('@/sesion/SesionProvider', () => ({ useSesion: () => ({ api: sesion.api, centro: { id: 1, nombre: 'Mostrador' }, estado: { tipo: 'activa', usuario: { id: 1, rol: sesion.rol, permisos: sesion.permisos } } }) }))
vi.mock('@/hooks/useTiempoReal', () => ({ useTiempoReal: () => true }))

const productos = [
  { id: 1, nombre: 'Shuko - Americano - Grande', sku: 'SH-1', precio: '40.00', categoria: { id: 1, nombre: 'Shukos' } },
  { id: 2, nombre: 'Limonada con hierbabuena', sku: 'BEB-1', precio: '15.00', categoria: { id: 2, nombre: 'Bebidas' } },
  { id: 3, nombre: 'Té frío', sku: 'BEB-2', precio: '12.50', categoria: { id: 2, nombre: 'Bebidas' } },
]
const pedido = { id: 'pedido-1', folio: 7, fecha_operacion: '2026-11-07', tipo_venta_id: 2, tipo_venta: { nombre: 'Para llevar' }, usuario: { nombre: 'Cajero' }, creado_en: '2026-11-07T18:00:00Z', estado_cocina: 'PENDIENTE', estado: 'ABIERTO', total: '40.00', pagado: '0.00', saldo: '40.00', cliente_nombre: 'Cliente de mostrador', mesa_referencia: null, pedido_detalle: [{ id: 'linea-1', cantidad: '1', importe: '40.00', estado: 'ACTIVA', producto: { nombre: productos[0].nombre }, usuario_pedido_detalle_agregado_porTousuario: { nombre: 'Cajero' }, agregado_en: '2026-11-07T18:00:00Z' }] }
const comprobante = { centro: { nombre: 'Mostrador' }, pedido, pagos: [] }
const metodos = [{ id: 1, codigo: 'EFECTIVO', nombre: 'Efectivo', requiere_terminal: false, requiere_referencia: false }]
let abierto = true
beforeEach(() => {
  localStorage.clear(); sesion.api.mockReset(); sesion.rol = 'CAJERO'; sesion.permisos = []; abierto = true
  sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
    if (ruta === '/pedidos') return opciones?.method === 'POST' ? pedido : []
    if (ruta === '/pedidos/catalogo') return productos
    if (ruta === '/pedidos/tipos') return [{ id: 1, codigo: 'MESA', nombre: 'Mesa' }, { id: 2, codigo: 'LLEVAR', nombre: 'Para llevar' }]
    if (ruta === '/caja/metodos') return metodos
    if (ruta === '/caja/pendientes') return [pedido]
    if (ruta === '/turnos') return abierto ? [{ estado: 'ABIERTO' }] : []
    if (ruta === '/caja/pedidos/pedido-1/comprobante') return comprobante
    if (ruta === '/caja/pagos') return { vuelto: '10.00', comprobante: { ...comprobante, pedido: { ...pedido, estado: 'PAGADO', pagado: '40.00', saldo: '0.00' } } }
    return []
  })
})

async function nuevo() {
  render(<Pedidos />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido' }))
  await userEvent.click(screen.getByRole('button', { name: 'Agregar Shuko - Americano - Grande por Q 40.00' }))
}
async function cobrar() {
  await nuevo()
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y cobrar' }))
  await screen.findByRole('form', { name: 'Cobrar pedido' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeEnabled())
}

describe('Venta de mostrador en una sola pantalla', () => {
  it('permite comer en mesa conservando productos y datos de cliente', async () => {
    await nuevo()
    fireEvent.change(screen.getByLabelText('Nombre del cliente (opcional)'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Teléfono del cliente/ }), { target: { value: '55551234' } })
    await userEvent.click(screen.getByRole('radio', { name: /Comer en mesa/ }))
    expect(screen.getByRole('radio', { name: /Comer en mesa/ })).toBeChecked()
    expect(screen.queryByLabelText('Mesa')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del cliente (opcional)')).toHaveValue('Ana')
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue(1)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }))
    await waitFor(() => expect(sesion.api.mock.calls.find(([ruta, opciones]) => ruta === '/pedidos' && opciones?.method === 'POST')).toBeTruthy())
    const envio = sesion.api.mock.calls.find(([ruta, opciones]) => ruta === '/pedidos' && opciones?.method === 'POST')!
    expect(JSON.parse(String(envio[1].body))).toMatchObject({ tipo_venta_id: 1, mesa_referencia: '', cliente_nombre: 'Ana', cliente_telefono: '55551234', lineas: [{ producto_id: 1, cantidad: '1' }] })
  })
  it('busca por teléfono, selecciona un cliente y envía su vínculo y datos con la venta', async () => {
    const anterior = sesion.api.getMockImplementation()!
    const cliente = { id: '73f98958-7be3-4db8-bdf9-cb91d52acf25', nombre: 'Ana Cliente', telefono: '55551234', direccion: 'Zona 1', version: 3, eliminado_en: null }
    sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => ruta.startsWith('/clientes?') ? { registros: [cliente], total: 1, pagina: 0 } : anterior(ruta,opciones))
    await nuevo()
    fireEvent.change(screen.getByRole('textbox', { name: /Teléfono del cliente/ }), { target: { value: '55551234' } })
    await userEvent.click(screen.getByRole('button', { name: 'Buscar cliente' }))
    expect(await screen.findByRole('dialog', { name: 'Buscar cliente' })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar Ana Cliente' }))
    expect(screen.getByLabelText('Nombre del cliente (opcional)')).toHaveValue('Ana Cliente')
    expect(screen.getByLabelText('Dirección del cliente')).toHaveValue('Zona 1')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }))
    await waitFor(() => expect(sesion.api.mock.calls.find(([ruta,opciones]) => ruta === '/pedidos' && opciones?.method === 'POST')).toBeTruthy())
    const llamada = sesion.api.mock.calls.find(([ruta,opciones]) => ruta === '/pedidos' && opciones?.method === 'POST')!
    expect(JSON.parse(String(llamada[1].body))).toMatchObject({ cliente_id: cliente.id, cliente_version: 3, cliente_telefono: '55551234', cliente_direccion: 'Zona 1', actualizar_cliente: false })
  })
  it('no registra como cliente anónimo un teléfono sin nombre y conserva los datos en el borrador', async () => {
    await nuevo()
    fireEvent.change(screen.getByRole('textbox', { name: /Teléfono del cliente/ }), { target: { value: '55551234' } })
    fireEvent.change(screen.getByLabelText('Dirección del cliente'), { target: { value: 'Zona 1' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el nombre del cliente')
    expect(sesion.api.mock.calls.some(([ruta,opciones]) => ruta === '/pedidos' && opciones?.method === 'POST')).toBe(false)
    expect(JSON.parse(localStorage.getItem('sirinventari.borrador.1.1')!)).toMatchObject({ cliente_telefono: '55551234', cliente_direccion: 'Zona 1' })
  })
  it('permite a un gerente enviar un pedido a la papelera con motivo y filtrar por fecha', async () => {
    sesion.rol = 'GERENTE'
    const anterior = sesion.api.getMockImplementation()!
    sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
      if (ruta === '/pedidos') return [{ ...pedido, estado: 'ANULADO', version: 2 }]
      if (ruta === '/pedidos?fecha=2026-11-07') return [{ ...pedido, estado: 'ANULADO', version: 2 }]
      if (ruta === '/papelera/pedidos/pedido-1/eliminacion') return { id: pedido.id }
      return anterior(ruta,opciones)
    })
    render(<Pedidos />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver pedido 7' }))
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar pedido' }))
    const ventana = screen.getByRole('dialog', { name: 'Enviar a la papelera' })
    fireEvent.change(within(ventana).getByLabelText('Motivo de eliminación'), { target: { value: 'Pedido de prueba' } })
    await userEvent.click(within(ventana).getByRole('button', { name: 'Confirmar envío a papelera' }))
    await screen.findByText('Pedido enviado a la papelera.')
    expect(sesion.api).toHaveBeenCalledWith('/papelera/pedidos/pedido-1/eliminacion', expect.objectContaining({ body: JSON.stringify({ version: 2, motivo: 'Pedido de prueba' }), method: 'POST' }))
    fireEvent.change(screen.getByLabelText('Fecha de pedidos'), { target: { value: '2026-11-07' } })
    await waitFor(() => expect(sesion.api).toHaveBeenCalledWith('/pedidos?fecha=2026-11-07'))
  })
  it('permite quitar productos en revisión, recalcula y después anula el pedido con motivo', async () => {
    await cobrar()
    const anterior = sesion.api.getMockImplementation()!
    let actual = comprobante
    sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
      if (ruta === '/pedidos/pedido-1/lineas/linea-1/anulacion') {
        actual = { ...actual, pedido: { ...actual.pedido, total: '0.00', saldo: '0.00', pedido_detalle: actual.pedido.pedido_detalle.map(l => ({ ...l, estado: 'ANULADA' })) } }
        return actual.pedido
      }
      if (ruta === '/pedidos/pedido-1/anulacion') { actual = { ...actual, pedido: { ...actual.pedido, estado: 'ANULADO' } }; return actual.pedido }
      if (ruta === '/caja/pedidos/pedido-1/comprobante') return actual
      return anterior(ruta, opciones)
    })
    await userEvent.click(screen.getByRole('button', { name: 'Quitar Shuko - Americano - Grande' }))
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Motivo del cambio'), 'Cliente cambió de opinión')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar retiro' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Quitar Shuko - Americano - Grande' })).not.toBeInTheDocument())
    expect(screen.getByText('Total: Q 0.00 · Pagado: Q 0.00 · Saldo: Q 0.00')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Anular pedido' }))
    await userEvent.type(screen.getByLabelText('Motivo del cambio'), 'Cliente cancela la compra')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
    expect(await screen.findByText(/Pedido anulado. Se conserva/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Imprimir ticket' })).not.toBeInTheDocument()
    const envio = sesion.api.mock.calls.find(([ruta]) => ruta === '/pedidos/pedido-1/anulacion')
    expect(JSON.parse(envio![1].body)).toEqual({ motivo: 'Cliente cancela la compra' })
  })

  it('solo imprime por elección después del pago y permite continuar sin imprimir', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {})
    await cobrar()
    expect(screen.queryByRole('button', { name: 'Imprimir ticket' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))
    const opciones = await screen.findByRole('region', { name: 'Ticket y opciones de impresión' })
    expect(imprimir).not.toHaveBeenCalled()
    const ticket = within(opciones).getByRole('article', { name: 'Ticket de venta' })
    expect(ticket).toHaveTextContent('Mostrador')
    expect(ticket).toHaveTextContent('0007')
    expect(ticket).toHaveTextContent('Shuko - Americano - Grande')
    expect(ticket).toHaveTextContent('Vuelto de ese pagoQ 10.00')
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir ticket' }))
    expect(imprimir).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Continuar sin imprimir' }))
    expect(screen.getByRole('form', { name: 'Nuevo pedido' })).toBeInTheDocument()
    expect(document.querySelector('.impresion-ticket')).not.toBeInTheDocument()
    expect(sesion.api.mock.calls.filter(([ruta]) => ruta === '/caja/pagos')).toHaveLength(1)
    imprimir.mockRestore()
  })

  it('guarda para llevar, cobra y permite iniciar la siguiente venta sin cambiar de módulo', async () => {
    await cobrar()
    const envio = sesion.api.mock.calls.find(([ruta, opciones]) => ruta === '/pedidos' && opciones?.method === 'POST')
    expect(JSON.parse(envio![1].body)).toMatchObject({ tipo_venta_id: 2, cliente_nombre: 'Cliente de mostrador', lineas: [{ producto_id: 1, cantidad: '1' }] })
    expect(screen.getByRole('heading', { name: 'Ventas' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cobrar pedido 7' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Efectivo recibido'), { target: { value: '50' } })
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))
    expect(await screen.findByText(/Pedido pagado.*Vuelto: Q 10.00/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido' }))
    expect(screen.getByRole('form', { name: 'Nuevo pedido' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Cantidad 1')).not.toBeInTheDocument()
  })

  it('filtra por categoría y busca sin tildes sin perder cantidades ni notas', async () => {
    await nuevo()
    expect(screen.getByRole('radio', { name: /Comer en mesa/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '2' } })
    await userEvent.type(screen.getByLabelText('Notas 1'), 'Sin cebolla')
    await userEvent.click(within(screen.getByLabelText('Categorías')).getByRole('button', { name: /Bebidas/ }))
    expect(screen.queryByRole('button', { name: /Agregar Shuko/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Agregar Té frío/ })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Buscar producto'), 'te frio')
    expect(screen.getByRole('button', { name: /Agregar Té frío/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar Limonada/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue(2)
    expect(screen.getByLabelText('Notas 1')).toHaveValue('Sin cebolla')
    expect(screen.getByText('Total de los productos nuevos: Q 80.00')).toBeInTheDocument()
  })

  it('bloquea cambiar de pedido ante un pago incierto y reintenta el mismo UUID', async () => {
    await cobrar()
    const anterior = sesion.api.getMockImplementation()!
    let intentos = 0
    sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
      if (ruta === '/caja/pagos' && ++intentos === 1) throw new Error('Sin red')
      return anterior(ruta, opciones)
    })
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await screen.findByRole('button', { name: 'Reintentar el mismo pago' })
    for (const nombre of ['Nuevo pedido', 'Volver al pedido', 'Pendientes y comprobantes']) expect(screen.getByRole('button', { name: nombre })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar el mismo pago' }))
    await screen.findByText(/Pedido pagado/)
    const envios = sesion.api.mock.calls.filter(([ruta]) => ruta === '/caja/pagos')
    expect(envios).toHaveLength(2)
    expect(envios[0][1].body).toBe(envios[1][1].body)
    expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeEnabled()
  })

  it('conserva productos e IDs si falla guardar y no abre un cobro sin pedido confirmado', async () => {
    await nuevo()
    const anterior = sesion.api.getMockImplementation()!
    sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
      if (ruta === '/pedidos' && opciones?.method === 'POST') throw new ErrorApi(409, 'Revisa el producto.')
      return anterior(ruta, opciones)
    })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y cobrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa el producto.')
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue(1)
    expect(sesion.api.mock.calls.some(([ruta]) => ruta.startsWith('/caja/'))).toBe(false)
  })

  it('sin turno conserva el pedido guardado pero bloquea el cobro', async () => {
    abierto = false
    await nuevo()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y cobrar' }))
    expect(await screen.findByText('Abre un turno de caja en este centro antes de cobrar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeDisabled()
  })

  it.each(['MESERO', 'restringido'])('no expone cobros al usuario %s', async rol => {
    if (rol === 'MESERO') sesion.rol = rol
    else sesion.permisos = [{ modulo: 'caja', accion: 'ver', permitido: false }]
    await nuevo()
    expect(screen.queryByRole('button', { name: 'Guardar y cobrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pendientes y comprobantes' })).not.toBeInTheDocument()
    expect(sesion.api.mock.calls.some(([ruta]) => ruta.startsWith('/caja/'))).toBe(false)
  })

  it('mantiene los cobros disponibles si solo se restringió ver pedidos', async () => {
    sesion.permisos = [{ modulo: 'pedidos', accion: 'ver', permitido: false }]
    render(<Pedidos iniciarCobros />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cobrar pedido 7' }))
    expect(await screen.findByRole('form', { name: 'Cobrar pedido' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeDisabled()
    expect(sesion.api.mock.calls.some(([ruta]) => ruta.startsWith('/pedidos'))).toBe(false)
  })
})
