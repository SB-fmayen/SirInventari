import { Store } from 'lucide-react'
import { useSesion } from '@/sesion/SesionProvider'
import type { UsuarioSistema } from '@/sesion/tipos'

/** El usuario trabaja en varios centros: elige en cuál va a trabajar ahora. */
export function SeleccionCentro({ usuario }: { usuario: UsuarioSistema }) {
  const { elegirCentro, salir } = useSesion()
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Hola, {usuario.nombre}</h1>
        <p className="mt-1 text-lg text-slate-600">¿En qué centro de venta vas a trabajar?</p>
        <div className="mt-6 grid gap-3">
          {usuario.centros.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => elegirCentro(c.id)}
              className="flex min-h-20 items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 text-left hover:border-teal-600 hover:bg-teal-50"
            >
              <Store className="size-8 text-teal-700" aria-hidden />
              <span>
                <span className="block text-xl font-semibold text-slate-900">{c.nombre}</span>
                <span className="block text-base text-slate-500">{c.codigo}</span>
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void salir()}
          className="mt-6 min-h-12 w-full rounded-xl text-base font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

/** El usuario no tiene ningún centro asignado. */
export function SinCentros() {
  const { salir } = useSesion()
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Store className="mx-auto mb-4 size-14 text-slate-400" aria-hidden />
        <p role="alert" className="text-lg text-slate-700">
          No tienes centros de venta asignados. Habla con el administrador.
        </p>
        <button
          type="button"
          onClick={() => void salir()}
          className="mt-6 min-h-14 w-full rounded-xl bg-teal-700 text-lg font-semibold text-white hover:bg-teal-800"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
