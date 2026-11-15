import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pedidos } from '@/paginas/Pedidos'
import { ErrorApi } from '@/lib/api'
import { baseLocal, claveDispositivo, guardarDato } from '@/lib/sinConexion'
import { sincronizar, siguienteFolioProvisional } from '@/lib/cola'

vi.mock('@/hooks/useTiempoReal', () => ({ useTiempoReal: () => false }))
const sesion = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('@/sesion/SesionProvider', () => ({ useSesion: () => ({ api: sesion.api, centro: { id: 1, nombre: 'Mostrador' }, estado: { tipo: 'activa', usuario: { id: 2, rol: 'CAJERO', permisos: [] } } }) }))

const menu = [{ id: 1, nombre: 'Shuko', sku: 'S-1', precio: '25.00', categoria: { id: 1, nombre: 'Shukos' } }]
const tipos = [{ id: 2, codigo: 'LLEVAR', nombre: 'Para llevar' }]
const metodos = [{ id: 1, codigo: 'EFECTIVO', nombre: 'Efectivo', requiere_terminal: false, requiere_referencia: false }]
const sinRed = () => new ErrorApi(0, 'No se pudo conectar con la API. Revisa el internet o que la API esté encendida.')

describe('Venta, cobro y comanda sin internet (Tareas 18 y 19)', () => {
  beforeEach(async () => {
    await baseLocal.cola.clear(); await baseLocal.datos.clear()
    await guardarDato(claveDispositivo(1), { id: 1, codigo: 'CAJA1', nombre: 'Caja principal', tipo: 'CAJA' })
    sesion.api.mockReset()
    sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
      if (opciones?.method === 'POST') throw sinRed()
      return ruta === '/pedidos/catalogo' ? menu : ruta === '/pedidos/tipos' ? tipos : ruta === '/caja/metodos' ? metodos : []
    })
  })

  it('guarda el pedido con folio provisional, cobra en modo mostrador, imprime la comanda y sincroniza en orden', async () => {
    const imprimir = vi.fn()
    vi.stubGlobal('print', imprimir)
    render(<Pedidos />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeEnabled(), { timeout: 5000 })
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar Shuko por Q 25.00' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar Shuko por Q 25.00' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y cobrar' }))
    expect(await screen.findByText(/folio provisional CAJA1-0001/)).toBeInTheDocument()

    const cobro = await screen.findByRole('form', { name: 'Cobro sin internet' })
    expect(within(cobro).getByText('Q 50.00')).toBeInTheDocument()
    await userEvent.type(within(cobro).getByLabelText('Efectivo recibido'), '100')
    expect(within(cobro).getByText('Vuelto: Q 50.00')).toBeInTheDocument()
    await userEvent.click(within(cobro).getByRole('button', { name: 'Guardar cobro sin internet' }))
    expect(await screen.findByText(/Cobro guardado sin internet para CAJA1-0001. Vuelto: Q 50.00/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '🖨 Imprimir comanda' }))
    await waitFor(() => expect(imprimir).toHaveBeenCalled())
    const hoja = document.querySelector('.impresion-ticket')!
    expect(hoja.textContent).toContain('FOLIO PROVISIONAL')
    expect(hoja.textContent).toContain('CAJA1-0001')
    expect(hoja.textContent).toContain('2 ×')

    const cola = await baseLocal.cola.orderBy('orden').toArray()
    expect(cola.map(o => o.tipo)).toEqual(['PEDIDO', 'PAGO'])
    expect(cola[0].datos).toMatchObject({ folio_offline: 'CAJA1-0001', lineas: [{ producto_id: 1, cantidad: '2' }] })
    expect(cola[1].datos).toMatchObject({ pedido_id: cola[0].datos.id, monto: '50.00', metodo_pago_id: 1 })
    expect(Date.parse(String(cola[0].datos.creado_en))).toBeLessThanOrEqual(Date.now())

    // Al volver el internet se envía todo junto y en orden.
    sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
      if (ruta === '/sincronizacion') {
        const cuerpo = JSON.parse(String(opciones?.body))
        expect(cuerpo.dispositivo_id).toBe(1)
        expect(cuerpo.operaciones.map((o: { tipo: string }) => o.tipo)).toEqual(['PEDIDO', 'PAGO'])
        return { resultados: [{ id: cuerpo.operaciones[0].datos.id, tipo: 'PEDIDO', resultado: 'APLICADO', folio: 15 }, { id: cuerpo.operaciones[1].datos.id, tipo: 'PAGO', resultado: 'APLICADO' }] }
      }
      return []
    })
    expect(await sincronizar(sesion.api, 1)).toBe(2)
    expect((await baseLocal.cola.toArray()).map(o => o.estado)).toEqual(['APLICADO', 'APLICADO'])
    expect(await screen.findByText('Enviado · folio definitivo 15')).toBeInTheDocument()
    expect(await sincronizar(sesion.api, 1)).toBe(0)
  })

  it('si la red falla al enviar, nada se pierde y el siguiente folio no se repite', async () => {
    expect(await siguienteFolioProvisional('CAJA1')).toBe('CAJA1-0001')
    expect(await siguienteFolioProvisional('CAJA1')).toBe('CAJA1-0002')
    await baseLocal.cola.add({ id: 'op', centro_id: 1, usuario_id: 2, tipo: 'PEDIDO', datos: { id: 'p', folio_offline: 'CAJA1-0002' }, creado_en: new Date().toISOString(), estado: 'PENDIENTE', intentos: 0 })
    expect(await sincronizar(sesion.api, 1)).toBe(0)
    const [op] = await baseLocal.cola.toArray()
    expect(op).toMatchObject({ estado: 'PENDIENTE', intentos: 1 })
  })

  it('un conflicto queda visible en el equipo con su motivo', async () => {
    await baseLocal.cola.add({ id: 'op', centro_id: 1, usuario_id: 2, tipo: 'PEDIDO', datos: { id: 'p', folio_offline: 'CAJA1-0003', total: '25.00' }, creado_en: new Date().toISOString(), estado: 'PENDIENTE', intentos: 0 })
    sesion.api.mockImplementation(async (ruta: string) => ruta === '/sincronizacion' ? { resultados: [{ id: 'p', tipo: 'PEDIDO', resultado: 'CONFLICTO', motivo: 'Dispositivo desactivado' }] } : [])
    render(<Pedidos />)
    await sincronizar(sesion.api, 1)
    expect(await screen.findByText('En revisión del gerente: Dispositivo desactivado')).toBeInTheDocument()
    expect(screen.getByText(/quedó en la bandeja del gerente/)).toBeInTheDocument()
  })
})
