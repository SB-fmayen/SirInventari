import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { SesionProvider } from '@/sesion/SesionProvider'

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
  it('muestra el menú con las 6 secciones en español', async () => {
    simularApi({ salud: 'sin-red' })
    abrir()
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' })
    for (const nombre of ['Pedidos', 'Cocina', 'Caja', 'Turnos', 'Catálogo', 'Reportes']) {
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
    expect(await screen.findByRole('heading', { name: 'Caja' })).toBeInTheDocument()
    expect(screen.getByText(/en construcción/)).toBeInTheDocument()
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

  it('un MESERO solo ve Pedidos', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('MESERO') })
    abrir()
    const menu = await textoMenu()
    expect(menu).toContain('Pedidos')
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

  it('COCINA solo ve Cocina y CAJERO ve Pedidos, Caja y Turnos', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('COCINA') })
    const { unmount } = abrir()
    expect((await textoMenu()).replace('Inicio', '')).toBe('Cocina')
    unmount()

    simularApi({ salud: 'sin-red', sesion: conRol('CAJERO') })
    abrir()
    expect((await textoMenu()).replace('Inicio', '')).toBe('PedidosCajaTurnos')
  })

  it('el GERENTE ve todo menos Usuarios', async () => {
    simularApi({ salud: 'sin-red', sesion: conRol('GERENTE') })
    abrir('/usuarios')
    const menu = await textoMenu()
    for (const s of ['Pedidos', 'Cocina', 'Caja', 'Turnos', 'Catálogo', 'Reportes']) expect(menu).toContain(s)
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
