import { render, screen, waitFor } from '@testing-library/react'
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

function simularApi({ salud, sesion }: { salud: Respuesta; sesion?: Respuesta }) {
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
    responder(url.endsWith('/salud') ? salud : (sesion ?? { status: 200, cuerpo: ADMIN })),
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
  firebase.usuarioActual = { uid: 'uid-admin' }
  firebase.errorAlEntrar = null
})

describe('Login (Tarea 4)', () => {
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
