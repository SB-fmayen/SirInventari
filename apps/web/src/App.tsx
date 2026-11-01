import { House, LoaderCircle, LogOut, Store } from 'lucide-react'
import { Link, NavLink, Route, Routes } from 'react-router'
import { IndicadorApi } from '@/componentes/IndicadorApi'
import { useSaludApi } from '@/hooks/useSaludApi'
import { cn } from '@/lib/utils'
import { EnConstruccion } from '@/paginas/EnConstruccion'
import { Inicio } from '@/paginas/Inicio'
import { Login } from '@/paginas/Login'
import { NoEncontrada } from '@/paginas/NoEncontrada'
import { SeleccionCentro, SinCentros } from '@/paginas/SeleccionCentro'
import { SinAcceso } from '@/paginas/SinAcceso'
import { SinPermiso } from '@/paginas/SinPermiso'
import { Usuarios } from '@/paginas/Usuarios'
import { Catalogo } from '@/paginas/Catalogo'
import { SECCIONES, puedeEntrar, seccionesDe } from '@/secciones'
import { useSesion } from '@/sesion/SesionProvider'
import { NOMBRE_ROL, type UsuarioSistema } from '@/sesion/tipos'

/** Decide qué mostrar según la sesión: cargando, login, sin acceso o la app. */
export default function App() {
  const { estado, centro } = useSesion()
  switch (estado.tipo) {
    case 'cargando':
      return (
        <div className="flex min-h-svh items-center justify-center gap-3 bg-slate-50 text-xl text-slate-600">
          <LoaderCircle className="size-8 animate-spin" aria-hidden />
          Cargando…
        </div>
      )
    case 'sin-sesion':
      return <Login />
    case 'sin-acceso':
      return <SinAcceso mensaje={estado.mensaje} />
    case 'activa':
      if (estado.usuario.centros.length === 0) return <SinCentros />
      if (!centro) return <SeleccionCentro usuario={estado.usuario} />
      return <Principal usuario={estado.usuario} />
  }
}

/** Estructura general: barra superior, menú de secciones y contenido. */
function Principal({ usuario }: { usuario: UsuarioSistema }) {
  const { salir, centro, cambiarCentro } = useSesion()
  const { estado, fechaOperacion, revisarAhora } = useSaludApi()
  const misSecciones = seccionesDe(usuario.rol)

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="size-11" />
            <span>
              <span className="block text-xl font-bold leading-tight text-slate-900">SirInventari</span>
              <span className="block text-sm text-slate-500">
                Sistema de ventas{fechaOperacion ? ` · Día de operación ${formatearFecha(fechaOperacion)}` : ''}
              </span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <IndicadorApi estado={estado} onRevisar={revisarAhora} />
            {centro && (
              <span className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-teal-50 px-4 text-base font-semibold text-teal-900">
                <Store className="size-5" aria-hidden />
                {centro.nombre}
                {usuario.centros.length > 1 && (
                  <button type="button" onClick={cambiarCentro} className="ml-1 text-sm font-medium text-teal-700 underline">
                    Cambiar
                  </button>
                )}
              </span>
            )}
            <span className="text-right leading-tight">
              <span className="block text-base font-semibold text-slate-900">{usuario.nombre}</span>
              <span className="block text-sm text-slate-500">{NOMBRE_ROL[usuario.rol]}</span>
            </span>
            <button
              type="button"
              onClick={() => void salir()}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-slate-100 px-4 text-base font-semibold text-slate-700 hover:bg-slate-200"
            >
              <LogOut className="size-5" aria-hidden />
              Cerrar sesión
            </button>
          </div>
        </div>
        <nav aria-label="Menú principal" className="flex gap-2 overflow-x-auto px-4 pb-3">
          <EnlaceMenu ruta="/" nombre="Inicio" icono={House} fin />
          {misSecciones.map((s) => (
            <EnlaceMenu key={s.ruta} ruta={s.ruta} nombre={s.nombre} icono={s.icono} />
          ))}
        </nav>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<Inicio secciones={misSecciones} />} />
          {SECCIONES.map((s) => (
            <Route
              key={s.ruta}
              path={s.ruta}
              element={!puedeEntrar(usuario.rol, s) ? <SinPermiso /> : s.ruta === '/usuarios' ? <Usuarios usuario={usuario} /> : s.ruta === '/catalogo' ? <Catalogo /> : <EnConstruccion seccion={s} />}
            />
          ))}
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
      </main>
    </div>
  )
}

function EnlaceMenu({
  ruta,
  nombre,
  icono: Icono,
  fin = false,
}: {
  ruta: string
  nombre: string
  icono: typeof House
  fin?: boolean
}) {
  return (
    <NavLink
      to={ruta}
      end={fin}
      className={({ isActive }) =>
        cn(
          'inline-flex min-h-14 shrink-0 items-center gap-2 rounded-xl px-5 text-lg font-semibold transition',
          isActive ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
        )
      }
    >
      <Icono className="size-6" aria-hidden />
      {nombre}
    </NavLink>
  )
}

/** "2026-10-31" → "31/10/2026" */
function formatearFecha(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}
