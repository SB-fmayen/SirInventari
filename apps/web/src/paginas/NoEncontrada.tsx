import { Link } from 'react-router'

export function NoEncontrada() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <h1 className="text-3xl font-bold text-slate-900">Página no encontrada</h1>
      <p className="mt-2 text-lg text-slate-600">La dirección que escribiste no existe.</p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-14 items-center rounded-xl bg-teal-700 px-8 text-lg font-semibold text-white hover:bg-teal-800"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
