import { ShieldX } from 'lucide-react'
import { useSesion } from '@/sesion/SesionProvider'

/** Se muestra cuando el usuario entró en Firebase pero la API no le da acceso. */
export function SinAcceso({ mensaje }: { mensaje: string }) {
  const { salir, reintentar } = useSesion()
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <ShieldX className="mx-auto mb-4 size-16 text-red-600" aria-hidden />
        <h1 className="text-2xl font-bold text-slate-900">No puedes entrar</h1>
        <p role="alert" className="mt-3 text-lg text-slate-700">
          {mensaje}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={reintentar}
            className="min-h-14 rounded-xl bg-slate-100 text-lg font-semibold text-slate-800 hover:bg-slate-200"
          >
            Intentar de nuevo
          </button>
          <button
            type="button"
            onClick={() => void salir()}
            className="min-h-14 rounded-xl bg-teal-700 text-lg font-semibold text-white hover:bg-teal-800"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
