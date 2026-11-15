import { useEffect, useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { ErrorApi } from '@/lib/api'
import { claveDispositivo, dispositivoActual, guardarDato, type DispositivoLocal } from '@/lib/sinConexion'

const campo = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base'
const nombresTipo: Record<string, string> = { CAJA: 'Caja', TABLET: 'Tablet', COCINA: 'Cocina', GERENCIA: 'Gerencia' }

/**
 * Tarea 17: cada tablet o caja se identifica (CAJA1, TAB01…). Ese código aparece en el
 * folio provisional de las ventas hechas sin internet (por ejemplo CAJA1-0001).
 */
export function EsteDispositivo() {
  const { api, centro, estado } = useSesion()
  const gerente = estado.tipo === 'activa' && ['ADMIN', 'GERENTE'].includes(estado.usuario.rol)
  const [actual, setActual] = useState<DispositivoLocal | null>(null)
  const [lista, setLista] = useState<DispositivoLocal[]>([])
  const [elegido, setElegido] = useState('')
  const [nuevo, setNuevo] = useState({ codigo: '', nombre: '', tipo: 'TABLET' })
  const [mensaje, setMensaje] = useState('')
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!centro) return
    let vigente = true
    void dispositivoActual(centro.id).then(d => { if (vigente) { setActual(d); setAbierto(!d) } })
    api<DispositivoLocal[]>('/dispositivos').then(l => { if (vigente) setLista(l) }).catch(() => { /* sin internet: queda la copia */ })
    return () => { vigente = false }
  }, [api, centro])

  if (!centro || (estado.tipo === 'activa' && estado.usuario.rol === 'COCINA')) return null
  async function usar(d: DispositivoLocal) {
    await guardarDato(claveDispositivo(centro!.id), d)
    setActual(d); setAbierto(false); setMensaje(`Este equipo quedó como ${d.codigo}.`)
  }
  async function registrar() {
    setMensaje('')
    try {
      const d = await api<DispositivoLocal>('/dispositivos', { method: 'POST', body: JSON.stringify(nuevo) })
      setLista(l => [...l, d]); setNuevo({ codigo: '', nombre: '', tipo: 'TABLET' })
      await usar(d)
    } catch (e) { setMensaje(e instanceof ErrorApi ? e.message : 'No se pudo registrar el dispositivo.') }
  }

  return <section aria-label="Este dispositivo" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p>{actual ? <>Este equipo es <strong className="rounded-lg bg-teal-50 px-2 py-1 text-teal-900">{actual.codigo}</strong> · {actual.nombre}</> : <strong className="text-amber-800">Elige qué equipo es este para poder vender sin internet.</strong>}</p>
      {actual && <button type="button" className="min-h-10 rounded-xl px-3 font-semibold text-teal-800 hover:bg-teal-50" onClick={() => setAbierto(a => !a)}>{abierto ? 'Cerrar' : 'Cambiar'}</button>}
    </div>
    {abierto && <div className="mt-3 space-y-3">
      <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); const d = lista.find(x => String(x.id) === elegido); if (d) void usar(d) }}>
        <label className="grow">Equipo registrado<select className={campo} value={elegido} onChange={e => setElegido(e.target.value)} required><option value="">Elige uno</option>{lista.map(d => <option key={d.id} value={d.id}>{d.codigo} · {d.nombre} ({nombresTipo[d.tipo] ?? d.tipo})</option>)}</select></label>
        <button className="min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50" disabled={!elegido}>Usar en este equipo</button>
      </form>
      {gerente && <details className="rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer font-semibold">Registrar un equipo nuevo</summary>
        <form className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={e => { e.preventDefault(); void registrar() }}>
          <label>Código<input className={campo} required maxLength={10} placeholder="CAJA2" value={nuevo.codigo} onChange={e => setNuevo({ ...nuevo, codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></label>
          <label>Nombre<input className={campo} required maxLength={60} placeholder="Caja de la terraza" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
          <label>Tipo<select className={campo} value={nuevo.tipo} onChange={e => setNuevo({ ...nuevo, tipo: e.target.value })}>{Object.entries(nombresTipo).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
          <button className="min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white">Registrar y usar aquí</button>
        </form>
      </details>}
    </div>}
    {mensaje && <p role="status" className="mt-2 text-sm">{mensaje}</p>}
  </section>
}
