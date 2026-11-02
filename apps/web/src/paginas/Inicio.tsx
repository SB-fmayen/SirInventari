import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import type { Seccion } from '@/secciones'

/** Pantalla de inicio: botones grandes para las secciones que el rol puede usar. */
export function Inicio({ secciones }: { secciones: Seccion[] }) {
  return (
    <div className="inicio-modulos mx-auto max-w-6xl">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-800">Tu espacio de trabajo</p>
      <h1 className="mb-6 text-3xl font-bold text-slate-900">¿Qué quieres hacer?</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secciones.map(({ ruta, nombre, descripcion, icono: Icono, color }) => (
          <Link
            key={ruta}
            to={ruta}
            className="tarjeta-modulo group relative flex min-h-48 flex-col items-start gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition active:scale-[0.98] hover:border-teal-400 hover:shadow-md focus-visible:outline-3 focus-visible:outline-teal-600"
          >
            <span className={`flex size-16 shrink-0 items-center justify-center rounded-2xl text-white ${color}`}>
              <Icono className="size-7" aria-hidden />
            </span>
            <ArrowUpRight className="absolute right-6 top-6 size-5 text-slate-400 transition group-hover:text-teal-700" aria-hidden />
            <span>
              <span className="block text-2xl font-bold text-slate-900">{nombre}</span>
              <span className="block text-base text-slate-600">{descripcion}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
