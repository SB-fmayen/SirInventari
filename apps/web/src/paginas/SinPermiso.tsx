import { ShieldX } from 'lucide-react'
import { Link } from 'react-router'

/** Se muestra si alguien escribe la dirección de una pantalla que su rol no puede usar. */
export function SinPermiso() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <ShieldX className="mx-auto mb-4 size-14 text-red-600" aria-hidden />
      <h1 className="text-3xl font-bold text-slate-900">No tienes permiso</h1>
      <p className="mt-2 text-lg text-slate-600">Tu rol no puede entrar a esta pantalla.</p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-14 items-center rounded-xl bg-teal-700 px-8 text-lg font-semibold text-white hover:bg-teal-800"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
