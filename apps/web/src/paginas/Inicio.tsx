import { Link } from 'react-router'
import type { Seccion } from '@/secciones'

/** Pantalla de inicio: botones grandes para las secciones que el rol puede usar. */
export function Inicio({ secciones }: { secciones: Seccion[] }) {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">¿Qué quieres hacer?</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secciones.map(({ ruta, nombre, descripcion, icono: Icono, color }) => (
          <Link
            key={ruta}
            to={ruta}
            className="flex min-h-36 items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition active:scale-[0.98] hover:border-slate-300 hover:shadow-md focus-visible:outline-3 focus-visible:outline-teal-600"
          >
            <span className={`flex size-16 shrink-0 items-center justify-center rounded-2xl text-white ${color}`}>
              <Icono className="size-9" aria-hidden />
            </span>
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
