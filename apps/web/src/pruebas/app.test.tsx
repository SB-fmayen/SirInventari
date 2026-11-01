import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import App from '@/App'

/** Simula la respuesta de GET /salud. */
function simularSalud(respuesta: (() => Promise<Response>) | 'sin-red') {
  const fetchFalso = vi.fn(() =>
    respuesta === 'sin-red' ? Promise.reject(new TypeError('Failed to fetch')) : respuesta(),
  )
  vi.stubGlobal('fetch', fetchFalso)
  return fetchFalso
}

const respuestaJson = (cuerpo: object, status = 200) => () =>
  Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } }))

function abrir(ruta = '/') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  it('muestra el menú con las 6 secciones en español', () => {
    simularSalud('sin-red')
    abrir()
    const menu = screen.getByRole('navigation', { name: 'Menú principal' })
    for (const nombre of ['Pedidos', 'Cocina', 'Caja', 'Turnos', 'Catálogo', 'Reportes']) {
      expect(menu).toHaveTextContent(nombre)
    }
  })

  it('dice que la API está conectada cuando /salud responde bien', async () => {
    const fetchFalso = simularSalud(
      respuestaJson({
        api: 'ok',
        baseDatos: 'ok',
        fechaOperacion: '2026-10-31',
        zonaHoraria: 'America/Guatemala',
        mensaje: 'La API y la base de datos funcionan.',
      }),
    )
    abrir()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('API conectada'))
    expect(screen.getByText(/Día de operación 31\/10\/2026/)).toBeInTheDocument()
    expect(fetchFalso).toHaveBeenCalledWith(expect.stringMatching(/\/salud$/), expect.anything())
  })

  it('avisa cuando la API funciona pero la base no responde (503)', async () => {
    simularSalud(
      respuestaJson(
        {
          api: 'ok',
          baseDatos: 'error',
          fechaOperacion: null,
          zonaHoraria: 'America/Guatemala',
          mensaje: 'La API funciona, pero no se pudo conectar con la base de datos.',
        },
        503,
      ),
    )
    abrir()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Base de datos sin respuesta'))
  })

  it('avisa cuando no hay conexión con la API', async () => {
    simularSalud('sin-red')
    abrir()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sin conexión con la API'))
  })

  it('cada sección muestra su pantalla', () => {
    simularSalud('sin-red')
    abrir('/caja')
    expect(screen.getByRole('heading', { name: 'Caja' })).toBeInTheDocument()
    expect(screen.getByText(/en construcción/)).toBeInTheDocument()
  })

  it('una dirección que no existe muestra "Página no encontrada"', () => {
    simularSalud('sin-red')
    abrir('/no-existe')
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})
