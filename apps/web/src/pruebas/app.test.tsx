import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { SesionProvider } from '@/sesion/SesionProvider'

vi.mock('@/hooks/useTiempoReal', () => ({ useTiempoReal: () => false }))

// ---------- Firebase simulado ----------
const firebase = vi.hoisted(() => ({
  usuarioActual: null as { uid: string } | null,
  oyente: null as ((u: { uid: string } | null) => void) | null,
  errorAlEntrar: null as { code: string } | null,
}))

vi.mock('@/lib/firebase', async (original) => {
  const real = await original<typeof import('@/lib/firebase')>()
  return {
    mensajeErrorFirebase: real.mensajeErrorFirebase,
    escucharSesion: (cb: (u: { uid: string } | null) => void) => {
      firebase.oyente = cb
      cb(firebase.usuarioActual)
      return () => {}
    },
    iniciarSesion: vi.fn(async () => {
      if (firebase.errorAlEntrar) throw firebase.errorAlEntrar
      firebase.usuarioActual = { uid: 'uid-admin' }
      firebase.oyente?.(firebase.usuarioActual)
    }),
    cerrarSesion: vi.fn(async () => {
      firebase.usuarioActual = null
      firebase.oyente?.(null)
    }),
    obtenerToken: async () => (firebase.usuarioActual ? 'token-falso' : null),
  }
})

// ---------- API simulada ----------
const ADMIN = {
  id: 1,
  nombre: 'Fernanda Admin',
  email: 'admin@ejemplo.com',
  rol: 'ADMIN',
  centros: [{ id: 1, codigo: 'CV01', nombre: 'Centro de venta 1' }],
}
const SALUD_OK = {
  api: 'ok',
  baseDatos: 'ok',
  fechaOperacion: '2026-10-31',
  zonaHoraria: 'America/Guatemala',
  mensaje: 'La API y la base de datos funcionan.',
}

type Respuesta = { status: number; cuerpo: object } | 'sin-red'

function simularApi({
  salud,
  sesion,
  otras = {},
}: {
  salud: Respuesta
  sesion?: Respuesta
  otras?: Record<string, Respuesta>
}) {
  const responder = (r: Respuesta) =>
    r === 'sin-red'
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve(
          new Response(JSON.stringify(r.cuerpo), {
            status: r.status,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
  const fetchFalso = vi.fn((url: string, _opciones?: RequestInit) =>
    responder(
      url.endsWith('/salud')
        ? salud
        : url.endsWith('/sesion')
          ? (sesion ?? { status: 200, cuerpo: ADMIN })
          : (Object.entries(otras).find(([ruta]) => url.endsWith(ruta))?.[1] ?? { status: 404, cuerpo: { mensaje: 'No se encontró lo que buscas.' } }),
    ),
  )
  vi.stubGlobal('fetch', fetchFalso)
  return fetchFalso
}

function abrir(ruta = '/') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SesionProvider>
        <App />
      </SesionProvider>
    </MemoryRouter>,
  )
}

describe('Ruta de Cocina (Tarea 9)', () => {
  it('abre el tablero real para ADMIN, sin la pantalla en construcción', async () => {
    simularApi({ salud: { status: 200, cuerpo: SALUD_OK }, otras: { '/cocina': { status: 200, cuerpo: [] } } })
    abrir('/cocina')
    expect(await screen.findByRole('region', { name: 'Pendientes' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'En preparación' })).toBeInTheDocument()
    expect(screen.queryByText(/Esta pantalla está en construcción/)).not.toBeInTheDocument()
  })

  it('impide que un MESERO entre a Cocina escribiendo la dirección', async () => {
    const peticiones = simularApi({ salud: 'sin-red', sesion: { status: 200, cuerpo: { ...ADMIN, rol: 'MESERO' } } })
    abrir('/cocina')
    expect(await screen.findByRole('heading', { name: 'No tienes permiso' })).toBeInTheDocument()
    expect(peticiones.mock.calls.some(([url]) => url.endsWith('/cocina'))).toBe(false)
  })
})

beforeEach(() => {
  localStorage.clear()
  firebase.usuarioActual = { uid: 'uid-admin' }
  firebase.errorAlEntrar = null
})

describe('Login (Tarea 4)', () => {
  it('una respuesta atrasada no restaura una sesión que ya se cerró', async () => {
    let responder!: (respuesta: Response) => void
    const pendiente = new Promise<Response>((resolve) => { responder = resolve })
    const fetchFalso = vi.fn(() => pendiente)
    vi.stubGlobal('fetch', fetchFalso)
    abrir()
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled())
    act(() => {
      firebase.usuarioActual = null
      firebase.oyente?.(null)
    })
    await act(async () => {
      responder(new Response(JSON.stringify(ADMIN), { status: 200 }))
      await pendiente
    })
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('sin sesión muestra la pantalla para entrar', () => {
    firebase.usuarioActual = null
    simularApi({ salud: { status: 200, cuerpo: SALUD_OK } })
    abrir()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByLabelText('Correo')).toBeInTheDocument()
  })

  it('pide correo y contraseña antes de enviar', async () => {
    firebase.usuarioActual = null
    simularApi({ salud: { status: 200, cuerpo: SALUD_OK } })
    abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe tu correo y tu contraseña.')
  })

  it('muestra en español cuando la contraseña es incorrecta', async () => {
    firebase.usuarioActual = null
    firebase.errorAlEntrar = { code: 'auth/invalid-credential' }
    simularApi({ salud: { status: 200, cuerpo: SALUD_OK } })
    abrir()
    await userEvent.type(screen.getByLabelText('Correo'), 'admin@ejemplo.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.')
  })

  it('al entrar muestra el nombre y el rol del usuario', async () => {
    firebase.usuarioActual = null
    simularApi({ salud: { status: 200, cuerpo: SALUD_OK } })
    abrir()
    await userEvent.type(screen.getByLabelText('Correo'), 'admin@ejemplo.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'buena')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Fernanda Admin')).toBeInTheDocument()
    expect(screen.getByText('Administrador')).toBeInTheDocument()
  })

  it('con la sesión guardada entra directo (como al recargar la página)', async () => {
    const fetchFalso = simularApi({ salud: { status: 200, cuerpo: SALUD_OK } })
    abrir()
    expect(await screen.findByText('Fernanda Admin')).toBeInTheDocument()
    const llamadaSesion = fetchFalso.mock.calls.find(([url]) => String(url).endsWith('/sesion'))
    expect(llamadaSesion?.[1]).toMatchObject({ headers: { Authorization: 'Bearer token-falso' } })
  })

  it('si la API no da acceso, muestra su mensaje y permite cerrar sesión', async () => {
    simularApi({
      salud: { status: 200, cuerpo: SALUD_OK },
      sesion: {
        status: 403,
        cuerpo: { statusCode: 403, mensaje: 'Tu usuario no tiene acceso. Habla con el administrador.' },
      },
    })
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu usuario no tiene acceso. Habla con el administrador.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('cerrar sesión vuelve a la pantalla de login', async () => {
    simularApi({ salud: { status: 200, cuerpo: SALUD_OK } })
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })
})

describe('App con sesión (Tarea 3)', () => {
  it('muestra Ventas unificada y los demás módulos en español', async () => {
    simularApi({ salud: 'sin-red' })
    abrir()
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' })
    for (const nombre of ['Ventas', 'Cocina', 'Turnos', 'Catálogo', 'Reportes']) {
      expect(menu).toHaveTextContent(nombre)
    }
  })

  it('dice que la API está conectada cuando /salud responde bien', async () => {
    simularApi({ salud: { status: 200, cuerpo: SALUD_OK } })
    abrir()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('API conectada'))
    expect(screen.getByText(/Día de operación 31\/10\/2026/)).toBeInTheDocument()
  })

  it('avisa cuando la API funciona pero la base no responde (503)', async () => {
    simularApi({ salud: { status: 503, cuerpo: { ...SALUD_OK, baseDatos: 'error', fechaOperacion: null } } })
    abrir()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Base de datos sin respuesta'))
  })

  it('avisa cuando no hay conexión con la API', async () => {
    simularApi({ salud: 'sin-red' })
    abrir()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sin conexión con la API'))
  })

  it('cada sección muestra su pantalla', async () => {
    simularApi({ salud: 'sin-red' })
    abrir('/caja')
    expect(await screen.findByRole('heading', { name: 'Ventas' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Pendientes y comprobantes' })).toBeInTheDocument()
  })

  it('una dirección que no existe muestra "Página no encontrada"', async () => {
    simularApi({ salud: 'sin-red' })
    abrir('/no-existe')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})

// ---------- Tarea 5: permisos por rol y centro ----------
const CV1 = { id: 1, codigo: 'CV01', nombre: 'Centro de venta 1' }
const CV2 = { id: 2, codigo: 'CV02', nombre: 'Centro de venta 2' }
const conRol = (rol: string, centros = [CV1]) => ({ status: 200, cuerpo: { ...ADMIN, nombre: 'Persona', rol, centros } })
const textoMenu = async () =>
  (await screen.findByRole('navigation', { name: 'Menú principal' })).textContent ?? ''

describe('Catálogo (Tarea 6)', () => {
  const categoria = { id: 1, nombre: 'Bebidas', orden: 1, activo: true }
  const producto = { id: 1, sku: 'BEB-1', nombre: 'Limonada', categoria_id: 1, precio_base: '12.5', activo: true, precio_centro: null, precio: '12.5', disponible: true, disponible_venta: true }

  it('muestra el precio del centro elegido y guarda la vuelta al precio base con null', async () => {
    const fetchFalso = simularApi({ salud: 'sin-red', sesion: conRol('ADMIN', [CV1, CV2]) })
    const anterior = fetchFalso.getMockImplementation()!
    fetchFalso.mockImplementation((url, opciones) => {
      if (url.includes('/catalogo/')) {
        const segundo = (opciones?.headers as Record<string, string> | undefined)?.['X-Centro-Id'] === '2'
        const cuerpo = url.endsWith('/categorias') ? [categoria] : [{ ...producto, precio: segundo ? '18.75' : '12.5', precio_centro: segundo ? '18.75' : null }]
        return Promise.resolve(new Response(JSON.stringify(cuerpo), { status: 200 }))
      }
      return anterior(url, opciones)
    })
    abrir('/catalogo')
    await userEvent.click(await screen.findByRole('button', { name: /Centro de venta 1/ }))
    expect(await screen.findByText('Usa precio base')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    await userEvent.click(screen.getByRole('button', { name: /Centro de venta 2/ }))
    expect(await screen.findByText('Q 18.75')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Editar producto Limonada' }))
    await userEvent.clear(screen.getByLabelText('Precio propio (vacío usa el base)'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar para este centro' }))
    const llamada = fetchFalso.mock.calls.find(([url]) => url.endsWith('/productos/1/centro'))
    expect(llamada?.[1]).toMatchObject({ method: 'PATCH', headers: { 'X-Centro-Id': '2' }, body: JSON.stringify({ precio: null, disponible: true }) })
    expect(await screen.findByText('Los cambios quedaron guardados.')).toBeInTheDocument()
  })

  it('busca por SKU y filtra por categoría', async () => {
    simularApi({ salud: 'sin-red', otras: {
      '/catalogo/categorias': { status: 200, cuerpo: [categoria, { id: 2, nombre: 'Platos', orden: 2, activo: true }] },
      '/catalogo/productos': { status: 200, cuerpo: [producto, { ...producto, id: 2, sku: 'COM-1', nombre: 'Almuerzo', categoria_id: 2 }] },
    } })
    abrir('/catalogo')
    expect(await screen.findByText('Almuerzo')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Buscar por nombre o SKU'), 'beb-1')
    expect(screen.getByText('Limonada')).toBeInTheDocument()
    expect(screen.queryByText('Almuerzo')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por categoría'), '2')
    expect(screen.getByText('No hay productos con esos filtros.')).toBeInTheDocument()
  })
})

describe('Turnos de caja (Tarea 7)', () => {
  const turno = { id: 7, fecha_operacion: '2026-10-31', nombre_apertura: 'Luis Cajero', abierto_en: '2026-11-01T03:00:00Z', nombre_cierre: null, cerrado_en: null, estado: 'ABIERTO', fondo_inicial: '100.10', efectivo_ventas: '20.20', efectivo_esperado: '120.30', efectivo_contado: null, diferencia: null }

  it('muestra quién abrió y cierra enviando el efectivo contado al centro elegido', async () => {
    const fetchFalso = simularApi({ salud: 'sin-red', sesion: conRol('CAJERO'), otras: {
      '/turnos': { status: 200, cuerpo: [turno] },
      '/turnos/7/cierre': { status: 201, cuerpo: { ...turno, estado: 'CERRADO', efectivo_contado: '120.20', diferencia: '-0.10' } },
    } })
    abrir('/turnos')
    expect(await screen.findByText(/Abierto por Luis Cajero/)).toBeInTheDocument()
    expect(screen.getByText('Día de operación')).toBeInTheDocument()
    expect(screen.getByText('31/10/2026')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Efectivo contado'), '120.20')
    expect(screen.getByText('Diferencia prevista: Q -0.10')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Motivo de la diferencia'), 'Faltante del conteo')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar turno' }))
    expect(await screen.findByText('Turno cerrado. Efectivo esperado: Q 120.30. Diferencia: Q -0.10.')).toHaveAttribute('role', 'status')
    const opciones = fetchFalso.mock.calls.find(([url]) => url.endsWith('/turnos/7/cierre'))?.[1]
    expect(opciones).toMatchObject({ method: 'POST', headers: { 'X-Centro-Id': '1' } })
    expect(Number(JSON.parse(String(opciones?.body)).efectivo_contado)).toBe(120.20)
  })

  it('si otra caja abrió mientras llenaba el fondo, muestra el mensaje de la API', async () => {
    const fetchFalso = simularApi({ salud: 'sin-red', otras: { '/turnos': { status: 200, cuerpo: [] } } })
    abrir('/turnos')
    await userEvent.type(await screen.findByLabelText('Fondo inicial'), '100')
    fetchFalso.mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ mensaje: 'Ya hay un turno abierto por Luis Cajero desde las 15:00.' }), { status: 409 })))
    await userEvent.click(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay un turno abierto por Luis Cajero')
  })
})

describe('Pedidos (Tarea 8)', () => {
  const id = '10000000-0000-4000-8000-000000000001'
  const linea = { id: '20000000-0000-4000-8000-000000000001', producto_id: 1, cantidad: '1', precio_unitario: '18.75', importe: '18.75', notas: 'Sin hielo', estado: 'ACTIVA', agregado_en: '2026-11-01T03:00:00Z', motivo_anulacion: null, producto: { nombre: 'Limonada' }, usuario_pedido_detalle_agregado_porTousuario: { nombre: 'Ana Mesera' } }
  const pedido = { id, folio: 1, tipo_venta_id: 1, mesa_referencia: 'Mesa 4', cliente_nombre: null, estado: 'ABIERTO', total: '18.75', pagado: '0.00', saldo: '18.75', creado_en: '2026-11-01T03:00:00Z', tipo_venta: { nombre: 'Consumo en mesa' }, usuario: { nombre: 'Ana Mesera' }, pedido_detalle: [linea] }
  const menu = [{ id: 1, nombre: 'Limonada', sku: 'BEB-1', precio: '18.75', categoria: { id: 1, nombre: 'Bebidas' } }]
  const tipos = [{ id: 1, codigo: 'MESA', nombre: 'Consumo en mesa' }]
  const otras = (pedidos: object[]) => ({ '/pedidos': { status: 200, cuerpo: pedidos }, '/pedidos/catalogo': { status: 200, cuerpo: menu }, '/pedidos/tipos': { status: 200, cuerpo: tipos } })

  it('busca productos por nombre o SKU sin perder las cantidades y notas del pedido', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('MESERO'), otras: otras([]) })
    abrir('/pedidos')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido' }))
    await userEvent.type(screen.getByLabelText('Buscar producto'), 'beb-1')
    await userEvent.click(screen.getByRole('button', { name: /Agregar Limonada/ }))
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '2' } })
    await userEvent.type(screen.getByLabelText('Notas 1'), 'Sin hielo')
    await userEvent.clear(screen.getByLabelText('Buscar producto'))
    await userEvent.type(screen.getByLabelText('Buscar producto'), 'pizza')
    expect(screen.getByText('No hay productos con esos filtros.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar Limonada/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue(2)
    expect(screen.getByLabelText('Notas 1')).toHaveValue('Sin hielo')
    expect(screen.getByText('Total de los productos nuevos: Q 37.50')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Buscar producto'))
    await userEvent.type(screen.getByLabelText('Buscar producto'), 'LIMONADA')
    expect(screen.getByRole('button', { name: /Agregar Limonada/ })).toBeInTheDocument()
  })

  it('las flechas suman unidades completas y el total conserva los precios en centavos', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('MESERO'), otras: {
      ...otras([]), '/pedidos/catalogo': { status: 200, cuerpo: [{ ...menu[0], nombre: 'Plato del día', precio: '45.00' }] },
    } })
    abrir('/pedidos')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar Plato del día por Q 45.00' }))
    const cantidad = screen.getByLabelText('Cantidad 1') as HTMLInputElement
    expect(cantidad).toHaveAttribute('min', '1')
    expect(cantidad).toHaveAttribute('step', '1')
    cantidad.stepUp()
    fireEvent.change(cantidad, { target: { value: cantidad.value } })
    expect(cantidad).toHaveValue(2)
    expect(screen.getByText('Total de los productos nuevos: Q 90.00')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Agregar Plato del día por Q 45.00' }))
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue(3)
    expect(screen.queryByLabelText('Cantidad 2')).not.toBeInTheDocument()
    expect(screen.getByText('Total de los productos nuevos: Q 135.00')).toBeInTheDocument()
  })

  it('no envía cantidades fraccionarias al guardar desde la pantalla de unidades', async () => {
    const fetchFalso = simularApi({ salud: 'sin-red', sesion: conRol('MESERO'), otras: otras([]) })
    abrir('/pedidos')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido' }))
    await userEvent.click(screen.getByRole('button', { name: /Agregar Limonada/ }))
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '1.01' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Nuevo pedido' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La cantidad de cada producto debe ser un número entero')
    expect(fetchFalso.mock.calls.filter(([, opciones]) => opciones?.method === 'POST')).toHaveLength(0)
  })

  it('genera UUID para pedido y líneas, conserva esos IDs al reintentar y envía notas sin precio', async () => {
    const fetchFalso = simularApi({ salud: 'sin-red', sesion: conRol('MESERO'), otras: otras([]) })
    const anterior = fetchFalso.getMockImplementation()!
    let intentos = 0
    fetchFalso.mockImplementation((url, opciones) => {
      if (url.endsWith('/pedidos') && opciones?.method === 'POST') {
        intentos++
        if (intentos === 1) return Promise.reject(new TypeError('Failed to fetch'))
        return Promise.resolve(new Response(JSON.stringify(pedido), { status: 201 }))
      }
      return anterior(url, opciones)
    })
    abrir('/pedidos')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido' }))
    await userEvent.type(screen.getByLabelText('Nombre del cliente (opcional)'), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: /Agregar Limonada por Q 18.75/ }))
    await userEvent.type(screen.getByLabelText('Notas 1'), 'Sin hielo')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con la API.')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }))
    expect(await screen.findByText('Pedido 1 guardado.')).toBeInTheDocument()
    const envios = fetchFalso.mock.calls.filter(([url, opciones]) => url.endsWith('/pedidos') && opciones?.method === 'POST')
    expect(envios).toHaveLength(2)
    expect(envios[0][1]?.body).toBe(envios[1][1]?.body)
    const cuerpo = JSON.parse(String(envios[0][1]?.body))
    expect(cuerpo.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(cuerpo.lineas[0]).toMatchObject({ producto_id: 1, cantidad: '1', notas: 'Sin hielo' })
    expect(cuerpo.lineas[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(cuerpo.lineas[0].precio_unitario).toBeUndefined()
  })

  it('agrega una línea al pedido existente y muestra quién y a qué hora la agregó', async () => {
    const fetchFalso = simularApi({ salud: 'sin-red', sesion: conRol('MESERO'), otras: otras([pedido]) })
    const anterior = fetchFalso.getMockImplementation()!
    fetchFalso.mockImplementation((url, opciones) => url.endsWith(`/pedidos/${id}/lineas`)
      ? Promise.resolve(new Response(JSON.stringify({ ...pedido, total: '37.50', saldo: '37.50', pedido_detalle: [linea, { ...linea, id: 'nueva', agregado_en: '2026-11-01T03:05:00Z', usuario_pedido_detalle_agregado_porTousuario: { nombre: 'Luis Cajero' } }] }), { status: 201 }))
      : anterior(url, opciones))
    abrir('/pedidos')
    await userEvent.click(await screen.findByRole('button', { name: 'Ver pedido 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar productos' }))
    await userEvent.click(screen.getByRole('button', { name: /Agregar Limonada por Q 18.75/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }))
    expect(await screen.findByText(/Agregado por Luis Cajero a las/)).toBeInTheDocument()
    expect(screen.getByText(/Agregado por Ana Mesera a las/)).toBeInTheDocument()
    const envio = fetchFalso.mock.calls.find(([url]) => url.endsWith(`/pedidos/${id}/lineas`))
    expect(envio?.[1]).toMatchObject({ method: 'POST', headers: { 'X-Centro-Id': '1' } })
    expect(JSON.parse(String(envio?.[1]?.body)).lineas).toHaveLength(1)
  })

  it('un pedido pagado muestra el detalle sin permitir agregar ni anular productos', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('MESERO'), otras: otras([{ ...pedido, estado: 'PAGADO' }]) })
    abrir('/pedidos')
    await userEvent.click(await screen.findByRole('button', { name: 'Ver pedido 1' }))
    expect(screen.queryByRole('button', { name: 'Agregar productos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anular Limonada' })).not.toBeInTheDocument()
  })
})

describe('Caja (Tarea 10)', () => {
  const id = '10000000-0000-4000-8000-000000000010'
  const pedido = { id, folio: 10, fecha_operacion: '2026-10-31', estado: 'ABIERTO', total: '45.00', pagado: '0.00', saldo: '45.00', mesa_referencia: 'Mesa 10', cliente_nombre: null, pedido_detalle: [{ id: 'linea', cantidad: '1', importe: '45.00', estado: 'ACTIVA', producto: { nombre: 'Plato del día' } }] }
  const comprobante = { centro: { nombre: 'Centro de venta 1' }, pedido, pagos: [] }
  const metodos = [{ id: 1, codigo: 'EFECTIVO', nombre: 'Efectivo', requiere_terminal: false, requiere_referencia: false }, { id: 2, codigo: 'TARJETA', nombre: 'Tarjeta', requiere_terminal: true, requiere_referencia: true }]
  const otras = (abierto = true) => ({ '/caja/pendientes': { status: 200, cuerpo: [pedido] }, '/caja/metodos': { status: 200, cuerpo: metodos }, '/turnos': { status: 200, cuerpo: abierto ? [{ estado: 'ABIERTO' }] : [] }, [`/caja/pedidos/${id}/comprobante`]: { status: 200, cuerpo: comprobante } })

  it('cobra efectivo con vuelto y luego el saldo con tarjeta, mostrando el comprobante', async () => {
    const fetchFalso = simularApi({ salud: 'sin-red', sesion: conRol('CAJERO'), otras: otras() })
    const anterior = fetchFalso.getMockImplementation()!
    fetchFalso.mockImplementation((url, opciones) => {
      if (!url.endsWith('/caja/pagos')) return anterior(url, opciones)
      const pago = JSON.parse(String(opciones?.body))
      const final = pago.metodo_pago_id === 2
      return Promise.resolve(new Response(JSON.stringify({ vuelto: final ? '0.00' : '30.00', comprobante: { ...comprobante, pedido: { ...pedido, pagado: final ? '45.00' : '20.00', saldo: final ? '0.00' : '25.00', estado: final ? 'PAGADO' : 'ABIERTO' }, pagos: [{ id: pago.id, monto: pago.monto, estado: 'APLICADO', metodo_pago: { nombre: final ? 'Tarjeta' : 'Efectivo' }, referencia_pos: final ? '123456' : null, terminal_pos: final ? 'TERM-1' : null }] } }), { status: 201 }))
    })
    abrir('/caja')
    await userEvent.click(await screen.findByRole('button', { name: 'Cobrar pedido 10' }))
    await userEvent.clear(await screen.findByLabelText('Monto a cobrar')); await userEvent.type(screen.getByLabelText('Monto a cobrar'), '20')
    await userEvent.clear(screen.getByLabelText('Efectivo recibido')); await userEvent.type(screen.getByLabelText('Efectivo recibido'), '50')
    expect(screen.getByText('Vuelto previsto: Q 30.00')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))
    expect(await screen.findByText(/Pago parcial guardado/)).toHaveTextContent('Vuelto: Q 30.00')
    await userEvent.selectOptions(screen.getByLabelText('Forma de pago'), '2')
    expect(screen.getByLabelText('Terminal del POS')).toBeRequired()
    expect(screen.getByLabelText('Número de autorización o referencia')).toBeRequired()
    await userEvent.type(screen.getByLabelText('Terminal del POS'), 'TERM-1')
    await userEvent.type(screen.getByLabelText('Número de autorización o referencia'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))
    expect(await screen.findByText(/Pago guardado. Pedido pagado/)).toBeInTheDocument()
    expect(screen.getByLabelText('Comprobante')).toHaveTextContent('Tarjeta: Q 25.00 · Autorización 123456 · Terminal TERM-1')
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument()
  })

  it('con resultado incierto conserva el mismo UUID y bloquea cambios hasta reintentar', async () => {
    const fetchFalso = simularApi({ salud: 'sin-red', sesion: conRol('CAJERO'), otras: otras() })
    const anterior = fetchFalso.getMockImplementation()!
    let numero = 0
    fetchFalso.mockImplementation((url, opciones) => {
      if (!url.endsWith('/caja/pagos')) return anterior(url, opciones)
      if (++numero === 1) return Promise.reject(new TypeError('Failed to fetch'))
      return Promise.resolve(new Response(JSON.stringify({ vuelto: '0.00', comprobante: { ...comprobante, pedido: { ...pedido, estado: 'PAGADO', saldo: '0.00', pagado: '45.00' } } }), { status: 201 }))
    })
    abrir('/caja'); await userEvent.click(await screen.findByRole('button', { name: 'Cobrar pedido 10' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar pago' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con la API')
    expect(screen.getByLabelText('Monto a cobrar')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar el mismo pago' }))
    expect(await screen.findByText(/Pago guardado. Pedido pagado/)).toBeInTheDocument()
    const envios = fetchFalso.mock.calls.filter(([url]) => url.endsWith('/caja/pagos'))
    expect(envios).toHaveLength(2); expect(envios[0][1]?.body).toBe(envios[1][1]?.body)
    expect(JSON.parse(String(envios[0][1]?.body)).id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('sin turno abierto no permite registrar un pago', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('CAJERO'), otras: otras(false) })
    abrir('/caja'); await userEvent.click(await screen.findByRole('button', { name: 'Cobrar pedido 10' }))
    expect(await screen.findByRole('button', { name: 'Registrar pago' })).toBeDisabled()
    expect(screen.getByText('Abre un turno de caja en este centro antes de cobrar.')).toBeInTheDocument()
  })
})

describe('Reportes (Tarea 11)', () => {
  const reporte = { desde: '2026-10-31', hasta: '2026-10-31', resumen: { total_pedidos: 2, total_vendido: '45.01', ticket_promedio: '22.51', descuentos: '0.02' }, por_tipo: [{ nombre: 'Mesa', cantidad: '2', total: '45.01' }], por_hora: [{ nombre: '21:00', cantidad: '2', total: '45.01' }], por_producto: [{ nombre: 'PLT-1 · Plato del día', cantidad: '2', total: '45.01' }], por_pago: [{ nombre: 'Efectivo', cantidad: '2', total: '45.01' }], pedidos: [{ id: 'pedido-reporte', folio: 1, fecha_operacion: '2026-10-31', total: '45.01', tipo: 'Mesa' }] }
  it('consulta el rango del centro y muestra el historial del pedido', async () => {
    const fetchFalso = simularApi({ salud: 'sin-red', sesion: conRol('GERENTE'), otras: {
      '/reportes/ventas': { status: 200, cuerpo: reporte },
      '/reportes/ventas?desde=2026-10-01&hasta=2026-10-31': { status: 200, cuerpo: { ...reporte, desde: '2026-10-01' } },
      '/reportes/pedidos/pedido-reporte/historial': { status: 200, cuerpo: { folio: 1, eventos: [{ fecha: '2026-11-01T03:00:00Z', usuario: 'Ana Mesera', descripcion: 'Agregó 1 de Plato del día.' }] } },
    } })
    abrir('/reportes')
    expect(await screen.findByText('Ticket promedio')).toBeInTheDocument()
    expect(screen.getByText('Q 22.51')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Desde')); await userEvent.type(screen.getByLabelText('Desde'), '2026-10-01')
    await userEvent.click(screen.getByRole('button', { name: 'Consultar ventas' }))
    expect(await screen.findByText('Mostrando del 01/10/2026 al 31/10/2026.')).toBeInTheDocument()
    expect(fetchFalso.mock.calls.find(([url]) => url.includes('desde=2026-10-01'))?.[1]).toMatchObject({ headers: { 'X-Centro-Id': '1' } })
    await userEvent.click(screen.getByRole('button', { name: 'Ver historial del pedido 1' }))
    expect(await screen.findByRole('heading', { name: 'Historial del pedido 1' })).toBeInTheDocument()
    expect(screen.getByText('Agregó 1 de Plato del día.')).toBeInTheDocument()
  })

  it('prepara un CSV para descargar con el nombre del centro y el rango consultado', async () => {
    const crear = vi.fn((_archivo: Blob) => 'blob:reporte')
    const URLOriginal = URL
    vi.stubGlobal('URL', class extends URLOriginal { static createObjectURL = crear; static revokeObjectURL = vi.fn() })
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    simularApi({ salud: 'sin-red', sesion: conRol('GERENTE'), otras: { '/reportes/ventas': { status: 200, cuerpo: reporte } } })
    abrir('/reportes'); await screen.findByText('Ticket promedio')
    await userEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }))
    expect(crear).toHaveBeenCalledOnce()
    expect(crear.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(clic).toHaveBeenCalledOnce()
    const enlace = clic.mock.instances[0] as HTMLAnchorElement
    expect(enlace.download).toBe('ventas-CV01-2026-10-31-2026-10-31.csv')
  })
})

describe('Permisos por rol y centro (Tarea 5)', () => {
  it('al cambiar de usuario el formulario muestra los datos del usuario elegido', async () => {
    simularApi({
      salud: 'sin-red',
      otras: {
        '/usuarios': { status: 200, cuerpo: [
          { id: 9, nombre: 'Ana Mesera', email: 'ana@ejemplo.com', rol: 'MESERO', activo: true, firebaseUid: 'a', centros: [CV1] },
          { id: 10, nombre: 'Carla Cajera', email: 'carla@ejemplo.com', rol: 'CAJERO', activo: true, firebaseUid: 'b', centros: [CV1] },
        ] },
        '/centros': { status: 200, cuerpo: [CV1] },
      },
    })
    abrir('/usuarios')
    await userEvent.click(await screen.findByRole('button', { name: 'Editar a Ana Mesera' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Mesera')
    await userEvent.click(screen.getByRole('button', { name: 'Editar a Carla Cajera' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Carla Cajera')
    expect(screen.getByLabelText('Correo')).toHaveValue('carla@ejemplo.com')
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
  })

  it('un MESERO solo ve Ventas, sin acceso a cobros', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('MESERO') })
    abrir()
    const menu = await textoMenu()
    expect(menu).toContain('Ventas')
    for (const otra of ['Cocina', 'Caja', 'Turnos', 'Catálogo', 'Reportes', 'Usuarios']) {
      expect(menu).not.toContain(otra)
    }
  })

  it('un MESERO no entra a Caja ni escribiendo la dirección', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('MESERO') })
    abrir('/caja')
    expect(await screen.findByRole('heading', { name: 'No tienes permiso' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Caja' })).not.toBeInTheDocument()
  })

  it('COCINA solo ve Cocina y CAJERO ve Ventas, Turnos y Clientes', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('COCINA') })
    const { unmount } = abrir()
    expect((await textoMenu()).replace('Inicio', '')).toBe('Cocina')
    unmount()

    simularApi({ salud: 'sin-red', sesion: conRol('CAJERO') })
    abrir()
    expect((await textoMenu()).replace('Inicio', '')).toBe('VentasTurnosClientes')
  })

  it('el GERENTE ve todo menos Usuarios', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('GERENTE') })
    abrir('/usuarios')
    const menu = await textoMenu()
    for (const s of ['Ventas', 'Cocina', 'Turnos', 'Catálogo', 'Reportes']) expect(menu).toContain(s)
    expect(menu).not.toContain('Usuarios')
    expect(screen.getByRole('heading', { name: 'No tienes permiso' })).toBeInTheDocument()
  })

  it('con varios centros pide elegir uno y luego lo envía a la API', async () => {
    const fetchFalso = simularApi({
      salud: 'sin-red',
      sesion: conRol('ADMIN', [CV1, CV2]),
      otras: {
        '/usuarios': { status: 200, cuerpo: [{ id: 9, nombre: 'Ana Mesera', email: 'ana@ejemplo.com', rol: 'MESERO', activo: true, firebaseUid: 'x', centros: [CV1] }] },
        '/centros': { status: 200, cuerpo: [CV1, CV2] },
      },
    })
    abrir('/usuarios')
    await userEvent.click(await screen.findByRole('button', { name: /Centro de venta 2/ }))
    expect(await screen.findByText('Ana Mesera')).toBeInTheDocument()
    const llamada = fetchFalso.mock.calls.find(([url]) => String(url).endsWith('/usuarios'))
    expect(llamada?.[1]).toMatchObject({ headers: { 'X-Centro-Id': '2', Authorization: 'Bearer token-falso' } })
  })

  it('recuerda el centro elegido al recargar', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('GERENTE', [CV1, CV2]) })
    const { unmount } = abrir()
    await userEvent.click(await screen.findByRole('button', { name: /Centro de venta 2/ }))
    expect(await screen.findByText('Centro de venta 2')).toBeInTheDocument()
    unmount()
    abrir()
    expect(await screen.findByRole('navigation', { name: 'Menú principal' })).toBeInTheDocument()
    expect(screen.getByText('Centro de venta 2')).toBeInTheDocument()
  })

  it('sin centros asignados avisa que hable con el administrador', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('CAJERO', []) })
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes centros de venta asignados.')
  })

  it('el ADMIN crea un usuario y ve los errores de la API en español', async () => {
    const fetchFalso = simularApi({
      salud: 'sin-red',
      otras: {
        '/usuarios': { status: 200, cuerpo: [] },
        '/centros': { status: 200, cuerpo: [CV1] },
      },
    })
    abrir('/usuarios')
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Asigna al menos un centro de venta.')

    fetchFalso.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ statusCode: 409, mensaje: 'Ya existe un usuario con ese correo.' }), { status: 409 })),
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'Centro de venta 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un usuario con ese correo.')
  })
})
