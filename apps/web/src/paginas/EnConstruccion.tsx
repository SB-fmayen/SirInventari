import { Construction } from 'lucide-react'
import { Link } from 'react-router'
import type { Seccion } from '@/secciones'

/** Pantalla provisional de una sección que todavía no está construida. */
export function EnConstruccion({ seccion }: { seccion: Seccion }) {
  const Icono = seccion.icono
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <span className={`mb-4 flex size-20 items-center justify-center rounded-2xl text-white ${seccion.color}`}>
        <Icono className="size-11" aria-hidden />
      </span>
      <h1 className="text-3xl font-bold text-slate-900">{seccion.nombre}</h1>
      <p className="mt-2 text-lg text-slate-600">{seccion.descripcion}</p>
      <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-base font-medium text-amber-900">
        <Construction className="size-5" aria-hidden />
        Esta pantalla está en construcción ({seccion.tarea} del plan).
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-14 items-center rounded-xl bg-teal-700 px-8 text-lg font-semibold text-white hover:bg-teal-800"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
