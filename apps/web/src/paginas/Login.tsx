import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { mensajeErrorFirebase } from '@/lib/firebase'
import { useSesion } from '@/sesion/SesionProvider'

/** Pantalla para entrar con correo y contraseña (Firebase Authentication). */
export function Login() {
  const { entrar } = useSesion()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function alEnviar(e: FormEvent) {
    e.preventDefault()
    if (!correo.trim() || !contrasena) {
      setError('Escribe tu correo y tu contraseña.')
      return
    }
    setError(null)
    setEnviando(true)
    try {
      await entrar(correo, contrasena)
    } catch (err) {
      setError(mensajeErrorFirebase(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={alEnviar}
        noValidate
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-8 flex items-center gap-3">
          <img src="/logo.svg" alt="" className="size-14" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">SirInventari</h1>
            <p className="text-base text-slate-500">Inicia sesión para continuar</p>
          </div>
        </div>

        <label htmlFor="correo" className="mb-2 block text-lg font-medium text-slate-800">
          Correo
        </label>
        <input
          id="correo"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className="mb-5 block min-h-14 w-full rounded-xl border border-slate-300 px-4 text-lg outline-none focus:border-teal-600 focus:ring-3 focus:ring-teal-600/30"
        />

        <label htmlFor="contrasena" className="mb-2 block text-lg font-medium text-slate-800">
          Contraseña
        </label>
        <input
          id="contrasena"
          type="password"
          autoComplete="current-password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          className="mb-6 block min-h-14 w-full rounded-xl border border-slate-300 px-4 text-lg outline-none focus:border-teal-600 focus:ring-3 focus:ring-teal-600/30"
        />

        {error && (
          <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-xl font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {enviando && <LoaderCircle className="size-6 animate-spin" aria-hidden />}
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
