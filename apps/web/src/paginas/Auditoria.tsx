import { useEffect, useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { ErrorApi } from '@/lib/api'

interface Evento { id: string; fecha: string; usuario: string; folio: number; fecha_operacion: string; pedido_id: string; que: string; explicacion: string; antes: unknown; despues: unknown }
interface UsuarioFiltro { id: number; nombre: string; rol: string }
const campo = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base'
const hora = (v: string) => new Date(v).toLocaleString('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const hoyGuatemala = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
const colores: Record<string, string> = { Pedido: 'bg-teal-100 text-teal-900', Pago: 'bg-emerald-100 text-emerald-900', 'Producto del pedido': 'bg-amber-100 text-amber-900' }

/** Tarea 16: quién hizo cada cambio en los pedidos, explicado en palabras. */
export function Auditoria() {
  const { api, centro } = useSesion()
  const [folio, setFolio] = useState('')
  const [fecha, setFecha] = useState(hoyGuatemala)
  const [usuario, setUsuario] = useState('')
  const [usuarios, setUsuarios] = useState<UsuarioFiltro[]>([])
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { api<UsuarioFiltro[]>('/auditoria/usuarios').then(setUsuarios).catch(() => setUsuarios([])) }, [api])

  async function buscar(filtros: { pedido?: string } = {}) {
    setCargando(true); setError('')
    const p = new URLSearchParams()
    if (filtros.pedido) p.set('pedido', filtros.pedido)
    else { if (folio.trim()) p.set('folio', folio.trim()); if (fecha) p.set('fecha', fecha); if (usuario) p.set('usuario', usuario) }
    try { setEventos(await api<Evento[]>(`/auditoria?${p.toString()}`)) }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo consultar la auditoría.'); setEventos(null) }
    finally { setCargando(false) }
  }

  return <div className="mx-auto max-w-5xl space-y-5">
    <div><h1 className="text-3xl font-bold">Auditoría</h1><p className="text-slate-600">{centro?.nombre} · Quién creó, agregó, quitó, cobró o anuló cada pedido. Horas de Guatemala.</p></div>
    <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4 sm:items-end" onSubmit={e => { e.preventDefault(); void buscar() }}>
      <label>Folio del pedido<input className={campo} inputMode="numeric" placeholder="Ejemplo: 12" value={folio} onChange={e => setFolio(e.target.value.replace(/\D/g, ''))} /></label>
      <label>Fecha<input type="date" className={campo} value={fecha} onChange={e => setFecha(e.target.value)} /></label>
      <label>Usuario<select className={campo} value={usuario} onChange={e => setUsuario(e.target.value)}><option value="">Todos</option>{usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>
      <button className="min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50" disabled={cargando || (!folio && !fecha && !usuario)}>{cargando ? 'Buscando…' : 'Buscar cambios'}</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {eventos && !eventos.length && <p className="rounded-xl bg-slate-50 p-4">No hay cambios con esos filtros.</p>}
    {eventos && eventos.length > 0 && <ol aria-label="Cambios encontrados" className="space-y-3">{eventos.map(e => <li key={e.id} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold"><span className={`mr-2 rounded-lg px-2 py-1 text-sm ${colores[e.que] ?? 'bg-slate-100'}`}>{e.que}</span>{e.usuario}</p>
        <p className="text-sm text-slate-600">{hora(e.fecha)}</p>
      </div>
      <p className="mt-2 text-lg">{e.explicacion}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span>Pedido {e.folio} · {e.fecha_operacion.split('-').reverse().join('/')}</span>
        <button type="button" className="font-semibold text-teal-800 underline" onClick={() => void buscar({ pedido: e.pedido_id })}>Ver todo el pedido {e.folio}</button>
      </div>
      <details className="mt-2 text-sm"><summary className="cursor-pointer text-slate-600">Ver datos técnicos (antes y después)</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><pre className="overflow-x-auto rounded-lg bg-slate-50 p-2">{JSON.stringify(e.antes, null, 1) ?? '—'}</pre><pre className="overflow-x-auto rounded-lg bg-slate-50 p-2">{JSON.stringify(e.despues, null, 1) ?? '—'}</pre></div></details>
    </li>)}</ol>}
  </div>
}
