import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SimuladorComisiones } from '@/componentes/SimuladorComisiones'
import { Reportes } from '@/paginas/Reportes'
import { ErrorApi } from '@/lib/api'

const sesion = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('@/sesion/SesionProvider', () => ({ useSesion: () => ({ api: sesion.api, centro: { id: 1, nombre: 'Centro 1', codigo: 'CV01' }, estado: { tipo: 'activa', usuario: { rol: 'GERENTE', centros: [{ id: 1 }] } } }) }))
const totales = { cobrado: '1000.00', comision: '55.00', iva: '6.60', descuento: '61.60', neto: '938.40' }
const reporte = {
  desde: '2026-11-16', hasta: '2026-11-16', terminal: null,
  porcentaje_comision: '5.50', porcentaje_iva: '12.00', totales,
  dias: [{ fecha: '2026-11-16', ...totales }], total_pedidos: 2, total_cobros: 2,
  pedidos: [
    { id: 'p1', folio: 7, fecha_operacion: '2026-11-16', cliente: 'Ana', monto: '600.00', cobros: 1, incluido: true },
    { id: 'p2', folio: 8, fecha_operacion: '2026-11-16', cliente: 'Luis', monto: '400.00', cobros: 1, incluido: true },
  ],
  cobros: [
    { id: 'c1', pedido_id: 'p1', folio: 7, fecha_pedido: '2026-11-16', fecha: '2026-11-16', monto: '600.00', terminal: 'CUBO1', autorizacion: 'ABC123' },
    { id: 'c2', pedido_id: 'p2', folio: 8, fecha_pedido: '2026-11-16', fecha: '2026-11-16', monto: '400.00', terminal: 'CUBO2', autorizacion: 'DEF456' },
  ],
}
const montar = () => render(<SimuladorComisiones desde="2026-11-16" hasta="2026-11-16" />)
const calcular = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Calcular comisiones' }))
  await screen.findByText('2 pedidos · 2 cobros incluidos en el cálculo.')
}

describe('Simulador de comisiones en Reportes', () => {
  beforeEach(() => { sesion.api.mockReset(); sesion.api.mockResolvedValue(reporte) })

  it('muestra el depósito y exporta los importes diarios y los vouchers', async () => {
    let csv: Blob | undefined
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL(blob: Blob) { csv = blob; return 'blob:comisiones' }
      static revokeObjectURL() {}
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    montar(); await calcular()
    expect(screen.getAllByText('Q 938.40')).toHaveLength(2)
    expect(screen.getByText('IVA de comisión · 12%')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Descargar CSV de comisiones' }))
    expect(click).toHaveBeenCalledOnce()
    const texto = await new Promise<string>(resolve => { const lector = new FileReader(); lector.onload = () => resolve(String(lector.result)); lector.readAsText(csv!) })
    expect(texto).toContain('938.40')
    expect(texto).toContain('ABC123')
    expect(texto).toContain('CUBO2')
    expect(texto).toContain('TOTAL')
    vi.unstubAllGlobals()
  })

  it('busca y selecciona pedidos; oculta el cálculo anterior hasta recalcular', async () => {
    montar(); await calcular()
    await userEvent.click(screen.getByText(/Filtrar por pedidos/))
    await userEvent.type(screen.getByLabelText('Buscar pedidos para seleccionar'), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar solo resultados' }))
    expect(screen.queryByText('Depósito estimado', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar CSV de comisiones' })).toBeDisabled()
    const nuevos = { cobrado: '600.00', comision: '33.00', iva: '3.96', descuento: '36.96', neto: '563.04' }
    sesion.api.mockResolvedValue({ ...reporte, total_pedidos: 1, total_cobros: 1, totales: nuevos, dias: [{ fecha: reporte.desde, ...nuevos }], pedidos: reporte.pedidos.map(p => ({ ...p, incluido: p.id === 'p1' })), cobros: [reporte.cobros[0]] })
    await userEvent.click(screen.getByRole('button', { name: 'Calcular selección' }))
    await screen.findByText('1 pedido · 1 cobro incluidos en el cálculo.')
    expect(sesion.api).toHaveBeenLastCalledWith('/reportes/comisiones?desde=2026-11-16&hasta=2026-11-16&pedidos=p1')
    expect(screen.getAllByText('Q 563.04')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar selección' }))
    expect(screen.getByRole('button', { name: 'Calcular selección' })).toBeDisabled()
  })

  it('filtra terminal y muestra el vacío y los errores sin exportar importes anteriores', async () => {
    montar(); await calcular()
    await userEvent.type(screen.getByLabelText('Terminal POS (opcional)'), 'OTRA')
    expect(screen.queryByText('Q 938.40')).not.toBeInTheDocument()
    sesion.api.mockResolvedValue({ ...reporte, terminal: 'OTRA', total_pedidos: 0, total_cobros: 0, pedidos: [], cobros: [], dias: [], totales: { cobrado: '0.00', comision: '0.00', iva: '0.00', descuento: '0.00', neto: '0.00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Calcular comisiones' }))
    await screen.findByText('No hay cobros por tarjeta para estos filtros.')
    expect(sesion.api).toHaveBeenLastCalledWith('/reportes/comisiones?desde=2026-11-16&hasta=2026-11-16&terminal=OTRA')
    sesion.api.mockRejectedValue(new ErrorApi(503, 'No se pudo consultar la base.'))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular comisiones' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar la base.')
    expect(screen.getByRole('button', { name: 'Descargar CSV de comisiones' })).toBeDisabled()
  })

  it('conserva la simulación entre fichas y la descarta al cambiar fechas', async () => {
    sesion.api.mockImplementation(async (ruta: string) => ruta.startsWith('/reportes/comisiones') ? reporte : {
      desde: '2026-11-16', hasta: '2026-11-16', resumen: { total_pedidos: 0, total_vendido: '0', ticket_promedio: '0', descuentos: '0' },
      por_tipo: [], por_hora: [], por_producto: [], por_pago: [], pedidos: [],
    })
    render(<Reportes />)
    await waitFor(() => expect(screen.getByLabelText('Desde')).toHaveValue('2026-11-16'))
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Calcular comisiones' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Comisiones Cubo' }))
    await calcular()
    await userEvent.click(screen.getByText(/Filtrar por pedidos/))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Incluir pedido 8 del 16/11/2026' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Ventas' }))
    expect(screen.getByText('Ticket promedio')).toBeVisible()
    await userEvent.click(screen.getByRole('tab', { name: 'Comisiones Cubo' }))
    expect(screen.getByRole('checkbox', { name: 'Incluir pedido 8 del 16/11/2026' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Descargar CSV de comisiones' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Incluir pedido 8 del 16/11/2026' }))
    expect(screen.getAllByText('Q 938.40')[0]).toBeVisible()
    expect(sesion.api.mock.calls.filter(([ruta]) => ruta.startsWith('/reportes/comisiones'))).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-15' } })
    const simulador = screen.getByRole('region', { name: 'Simulador de comisiones' })
    expect(within(simulador).queryByText('Q 938.40')).not.toBeInTheDocument()
    expect(within(simulador).getByRole('button', { name: 'Descargar CSV de comisiones' })).toBeDisabled()
    await userEvent.click(within(simulador).getByRole('button', { name: 'Calcular comisiones' }))
    expect(sesion.api).toHaveBeenLastCalledWith('/reportes/comisiones?desde=2026-11-15&hasta=2026-11-16')
  })
})
