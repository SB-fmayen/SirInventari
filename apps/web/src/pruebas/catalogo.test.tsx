import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Catalogo } from '@/paginas/Catalogo'
import { ErrorApi } from '@/lib/api'

const sesion = vi.hoisted(() => ({ api: vi.fn(), rol: 'ADMIN' }))
vi.mock('@/sesion/SesionProvider', () => ({ useSesion: () => ({ api: sesion.api, centro: { id: 1, nombre: 'Centro prueba' }, estado: { tipo: 'activa', usuario: { id: 1, rol: sesion.rol } } }) }))
let categoria: { id: number; nombre: string; orden: number; activo: boolean }
let producto: { id: number; nombre: string; sku: string; categoria_id: number; precio_base: string; activo: boolean; precio_centro: string | null; precio: string; disponible: boolean; disponible_venta: boolean }
beforeEach(() => {
  sesion.api.mockReset(); sesion.rol = 'ADMIN'
  categoria = { id: 1, nombre: 'Bebidas', orden: 1, activo: true }
  producto = { id: 1, nombre: 'Limonada', sku: 'BEB-1', categoria_id: 1, precio_base: '15.00', activo: true, precio_centro: null, precio: '15.00', disponible: true, disponible_venta: true }
  sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
    const datos = opciones?.body ? JSON.parse(String(opciones.body)) : {}
    if (ruta === '/catalogo/productos/1' && opciones?.method === 'PATCH') { Object.assign(producto, datos); return producto }
    if (ruta === '/catalogo/productos/1/centro' && opciones?.method === 'PATCH') { producto.precio_centro = datos.precio; if (datos.disponible !== undefined) producto.disponible = datos.disponible; return producto }
    if (ruta === '/catalogo/categorias/1' && opciones?.method === 'PATCH') { Object.assign(categoria, datos); return categoria }
    if (ruta === '/catalogo/categorias') return [{ ...categoria }]
    if (ruta === '/catalogo/productos') return [{ ...producto, precio: producto.precio_centro ?? producto.precio_base, disponible_venta: producto.activo && producto.disponible && categoria.activo }]
    return {}
  })
})
async function abrirProducto() {
  render(<Catalogo />)
  await userEvent.click(await screen.findByRole('button', { name: 'Editar producto Limonada' }))
  return screen.getByRole('dialog', { name: 'Editar producto' })
}

describe('Catálogo ordenado y editable', () => {
  it('abre un editor visible, guarda nombre/precio y mantiene los cambios del centro pendientes', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const editor = await abrirProducto()
    fireEvent.change(within(editor).getByLabelText('Nombre del producto'), { target: { value: 'Limonada grande' } })
    fireEvent.change(screen.getByLabelText('Precio base'), { target: { value: '18.50' } })
    fireEvent.change(screen.getByLabelText('Precio propio (vacío usa el base)'), { target: { value: '20' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar producto' }))
    await screen.findByText('Los cambios quedaron guardados.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Precio propio (vacío usa el base)')).toHaveValue(20)
    expect(producto.nombre).toBe('Limonada grande')
    expect(producto.precio_base).toBe('18.50')
    expect(producto.precio_centro).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(confirmar).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar para este centro' }))
    await waitFor(() => expect(producto.precio_centro).toBe('20'))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(confirmar).toHaveBeenCalledOnce()
    expect(screen.getByText('Q 20.00')).toBeInTheDocument()
    confirmar.mockRestore()
  })

  it('permite editar nombre y orden de categoría en su propia sección', async () => {
    render(<Catalogo />)
    await userEvent.click(await screen.findByRole('button', { name: 'Categorías (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Editar categoría Bebidas' }))
    expect(screen.getByRole('dialog', { name: 'Editar categoría' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nombre de categoría'), { target: { value: 'Bebidas frías' } })
    fireEvent.change(screen.getByLabelText('Orden'), { target: { value: '3' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }))
    await screen.findByText('Los cambios quedaron guardados.')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByRole('heading', { name: 'Bebidas frías' })).toBeInTheDocument()
    expect(screen.getByText('Orden 3 · 1 productos')).toBeInTheDocument()
  })

  it('desactiva y reactiva productos y categorías sin eliminarlos', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Catalogo />)
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar producto Limonada' }))
    expect(await screen.findByRole('button', { name: 'Activar producto Limonada' })).toBeInTheDocument()
    expect(screen.getByText('Desactivado')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Activar producto Limonada' }))
    await screen.findByRole('button', { name: 'Desactivar producto Limonada' })
    await userEvent.click(screen.getByRole('button', { name: 'Categorías (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar categoría Bebidas' }))
    expect(await screen.findByRole('button', { name: 'Activar categoría Bebidas' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Activar categoría Bebidas' }))
    await screen.findByRole('button', { name: 'Desactivar categoría Bebidas' })
    expect(sesion.api.mock.calls.some(([, opciones]) => opciones?.method === 'DELETE')).toBe(false)
    confirmar.mockRestore()
  })

  it('muestra solo Eliminar y conserva la confirmación con el nombre y el bloqueo por historial', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const anterior = sesion.api.getMockImplementation()!
    sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
      if (opciones?.method === 'DELETE') throw new ErrorApi(409, 'El producto tiene historial. Desactívalo.')
      return anterior(ruta, opciones)
    })
    render(<Catalogo />)
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('Limonada'))
    expect(await screen.findByRole('alert')).toHaveTextContent('El producto tiene historial. Desactívalo.')
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveTextContent(/^Eliminar$/)
    expect(screen.getByText('Limonada')).toBeInTheDocument()
    confirmar.mockRestore()
  })

  it('muestra errores de edición dentro del editor y conserva los campos para corregir o reintentar', async () => {
    const anterior = sesion.api.getMockImplementation()!
    sesion.api.mockImplementation(async (ruta: string, opciones?: RequestInit) => {
      if (opciones?.method === 'PATCH') throw new ErrorApi(409, 'Ese SKU ya existe.')
      return anterior(ruta, opciones)
    })
    const editor = await abrirProducto()
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'DUP-1' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar producto' }))
    expect(await within(editor).findByRole('alert')).toHaveTextContent('Ese SKU ya existe.')
    expect(screen.getByLabelText('SKU')).toHaveValue('DUP-1')
  })

  it('el gerente puede editar y desactivar pero no recibe botones de eliminación', async () => {
    sesion.rol = 'GERENTE'
    render(<Catalogo />)
    await screen.findByRole('button', { name: 'Editar producto Limonada' })
    expect(screen.getByRole('button', { name: 'Desactivar producto Limonada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
  })
})
