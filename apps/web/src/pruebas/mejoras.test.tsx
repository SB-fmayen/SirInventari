import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
} from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pedidos } from '@/paginas/Pedidos'
import { PreciosLote } from '@/componentes/AdministracionRegistros'
import { AccionControl } from '@/componentes/AccionControl'
import { ProteccionNavegacion } from '@/componentes/ProteccionNavegacion'
import { useCambiosSinGuardar } from '@/hooks/useCambiosSinGuardar'
import { rangoRapido } from '@/lib/fechas'

const sesion = vi.hoisted(() => ({ api: vi.fn(), rol: 'ADMIN' }))
vi.mock('@/sesion/SesionProvider', () => ({
  useSesion: () => ({
    api: sesion.api,
    centro: { id: 1, nombre: 'Centro prueba' },
    estado: {
      tipo: 'activa',
      usuario: {
        id: 17,
        rol: sesion.rol,
        centros: [{ id: 1, nombre: 'Centro prueba' }],
      },
    },
  }),
}))
vi.mock('@/hooks/useTiempoReal', () => ({ useTiempoReal: () => false }))
beforeEach(() => {
  localStorage.clear()
  sesion.api.mockReset()
  sesion.rol = 'ADMIN'
})

function Editor() {
  const [texto, setTexto] = useState('')
  useCambiosSinGuardar(!!texto)
  return (
    <>
      <h1>Editar</h1>
      <label>
        Dato
        <input value={texto} onChange={(e) => setTexto(e.target.value)} />
      </label>
      <Link to="/destino">Cambiar módulo</Link>
    </>
  )
}
function Navegacion() {
  const ruta = useLocation()
  return (
    <>
      <ProteccionNavegacion />
      {ruta.pathname === '/' ? <Editor /> : <h1>Destino</h1>}
    </>
  )
}

describe('Mejoras de operación aprobadas', () => {
  it('permite quedarse con cambios o salir al confirmar la navegación', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = createMemoryRouter([{ path: '*', element: <Navegacion /> }])
    render(<RouterProvider router={router} />)
    await userEvent.type(screen.getByLabelText('Dato'), 'sin guardar')
    await userEvent.click(screen.getByRole('link', { name: 'Cambiar módulo' }))
    expect(confirmar).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: 'Editar' })).toBeInTheDocument()
    confirmar.mockReturnValue(true)
    await userEvent.click(screen.getByRole('link', { name: 'Cambiar módulo' }))
    expect(
      await screen.findByRole('heading', { name: 'Destino' }),
    ).toBeInTheDocument()
    confirmar.mockRestore()
    router.dispose()
  })

  it('recupera el borrador del usuario y centro sin enviarlo como venta', async () => {
    sesion.rol = 'MESERO'
    sesion.api.mockImplementation(async (ruta: string) =>
      ruta === '/pedidos'
        ? []
        : ruta === '/pedidos/tipos'
          ? [{ id: 1, codigo: 'MESA', nombre: 'Mesa' }]
          : [
              {
                id: 1,
                nombre: 'Shuko',
                sku: 'SH-1',
                precio: '20.25',
                categoria: { id: 1, nombre: 'Comida' },
              },
            ],
    )
    const vista = render(<Pedidos />)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Nuevo pedido' }),
      ).toBeEnabled(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido' }))
    await userEvent.type(screen.getByLabelText('Mesa'), 'Mesa 3')
    await userEvent.click(
      screen.getByRole('button', { name: 'Agregar Shuko por Q 20.25' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Aumentar cantidad 1' }),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Nota frecuente 1'),
      'Sin cebolla',
    )
    expect(
      screen.getByText('Total de los productos nuevos: Q 40.50'),
    ).toBeInTheDocument()
    vista.unmount()
    render(<Pedidos />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Recuperar borrador' }),
    )
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue(2)
    expect(screen.getByLabelText('Notas 1')).toHaveValue('Sin cebolla')
    expect(screen.getByLabelText('Mesa')).toHaveValue('Mesa 3')
    expect(sesion.api.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(
      false,
    )
  })

  it('aplica únicamente los precios revisados y conserva el precio anterior para detectar conflictos', async () => {
    sesion.api.mockResolvedValue({})
    const actualizar = vi.fn(async () => {})
    render(
      <PreciosLote
        productos={[
          {
            id: 1,
            nombre: 'Plato',
            precio_base: '20',
            precio: '20',
            precio_centro: null,
          },
        ]}
        alGuardar={actualizar}
      />,
    )
    fireEvent.click(screen.getByText('Actualizar precios con vista previa'))
    await userEvent.type(
      screen.getByLabelText('Nuevo precio de Plato'),
      '25.50',
    )
    expect(
      screen.getByRole('button', { name: 'Aplicar precios revisados' }),
    ).toBeDisabled()
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Revisé los precios anteriores y nuevos',
      }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Aplicar precios revisados' }),
    )
    await waitFor(() => expect(actualizar).toHaveBeenCalledOnce())
    expect(JSON.parse(sesion.api.mock.calls[0][1].body)).toEqual({
      alcance: 'centro',
      precios: [{ producto_id: 1, anterior: null, nuevo: '25.5' }],
    })
  })

  it('el cajero solicita autorización y reintenta con el mismo UUID sin autorizarse', async () => {
    sesion.rol = 'CAJERO'
    sesion.api
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValue({ id: 'solicitud' })
    render(
      <AccionControl tipo="CORTESIA" pedidoId="pedido" etiqueta="Cortesía" />,
    )
    fireEvent.click(screen.getByText('Cortesía'))
    await userEvent.type(
      screen.getByLabelText('Motivo de cortesía'),
      'Atención al cliente',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Solicitar autorización' }),
    )
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Reintentar solicitud' }),
    )
    expect(
      await screen.findByText(
        'Solicitud enviada. Un gerente debe revisarla en Inicio.',
      ),
    ).toBeInTheDocument()
    expect(sesion.api.mock.calls).toHaveLength(2)
    expect(sesion.api.mock.calls[0][1].body).toBe(
      sesion.api.mock.calls[1][1].body,
    )
    expect(
      sesion.api.mock.calls.every(([ruta]) => ruta === '/control/solicitudes'),
    ).toBe(true)
  })

  it('los rangos rápidos respetan meses y semana de lunes a domingo', () => {
    expect(rangoRapido('ayer', '2026-03-01')).toEqual({
      desde: '2026-02-28',
      hasta: '2026-02-28',
    })
    expect(rangoRapido('semana', '2026-11-01')).toEqual({
      desde: '2026-10-26',
      hasta: '2026-11-01',
    })
    expect(rangoRapido('mes', '2026-11-02')).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-02',
    })
  })
})
