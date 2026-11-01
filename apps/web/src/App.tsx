import { House } from 'lucide-react'
import { Link, NavLink, Route, Routes } from 'react-router'
import { IndicadorApi } from '@/componentes/IndicadorApi'
import { useSaludApi } from '@/hooks/useSaludApi'
import { cn } from '@/lib/utils'
import { EnConstruccion } from '@/paginas/EnConstruccion'
import { Inicio } from '@/paginas/Inicio'
import { NoEncontrada } from '@/paginas/NoEncontrada'
import { SECCIONES } from '@/secciones'

/** Estructura general: barra superior, menú de secciones y contenido. */
export default function App() {
  const { estado, fechaOperacion, revisarAhora } = useSaludApi()

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
          <IndicadorApi estado={estado} onRevisar={revisarAhora} />
        </div>
        <nav aria-label="Menú principal" className="flex gap-2 overflow-x-auto px-4 pb-3">
          <EnlaceMenu ruta="/" nombre="Inicio" icono={House} fin />
          {SECCIONES.map((s) => (
            <EnlaceMenu key={s.ruta} ruta={s.ruta} nombre={s.nombre} icono={s.icono} />
          ))}
        </nav>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<Inicio />} />
          {SECCIONES.map((s) => (
            <Route key={s.ruta} path={s.ruta} element={<EnConstruccion seccion={s} />} />
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
