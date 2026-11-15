import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { ErrorApi } from '@/lib/api'

interface Conflicto { id: string; tipo: string; dispositivo: string; motivo: string; recibido_en: string; datos: Record<string, unknown> }
interface Bandeja { conflictos: Conflicto[]; atrasados: { codigo: string; nombre: string; ultima_sincronizacion: string | null }[] }
const tipos: Record<string, string> = { PEDIDO: 'Pedido', LINEA: 'Producto agregado', PAGO: 'Cobro' }
const hora = (v: string) => new Date(v).toLocaleString('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'short' })

/** Tarea 18 · Lo que llegó sin internet y no se pudo aplicar: el gerente lo revisa aquí. Nada se pierde. */
export function BandejaConflictos() {
  const { api, estado } = useSesion()
  const gerente = estado.tipo === 'activa' && ['ADMIN', 'GERENTE'].includes(estado.usuario.rol)
  const [bandeja, setBandeja] = useState<Bandeja | null>(null)
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [mensaje, setMensaje] = useState('')
  const cargar = useCallback(() => { api<Bandeja>('/sincronizacion/conflictos').then(setBandeja).catch(() => setBandeja(null)) }, [api])
  useEffect(() => { if (gerente) cargar() }, [gerente, cargar])
  if (!gerente || !bandeja || (!bandeja.conflictos.length && !bandeja.atrasados.length)) return null
  async function resolver(id: string, estadoNuevo: 'RESUELTO' | 'DESCARTADO') {
    setMensaje('')
    try { await api(`/sincronizacion/conflictos/${id}`, { method: 'POST', body: JSON.stringify({ estado: estadoNuevo, nota: notas[id] ?? '' }) }); cargar() }
    catch (e) { setMensaje(e instanceof ErrorApi ? e.message : 'No se pudo guardar.') }
  }
  return <section aria-label="Bandeja de conflictos" className="mb-6 space-y-3 rounded-2xl border border-red-200 bg-white p-4">
    {bandeja.atrasados.map(d => <p key={d.codigo} role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">⚠ {d.codigo} ({d.nombre}) no sincroniza desde {d.ultima_sincronizacion ? hora(d.ultima_sincronizacion) : 'hace rato'}. Revisa su internet.</p>)}
    {bandeja.conflictos.length > 0 && <>
      <h2 className="text-xl font-bold">Bandeja de conflictos ({bandeja.conflictos.length})</h2>
      <p className="text-sm text-slate-600">Ventas o cobros hechos sin internet que la nube no pudo aplicar. Revisa cada uno, haz la corrección en el sistema si hace falta y anota qué hiciste.</p>
      {mensaje && <p role="alert" className="text-red-800">{mensaje}</p>}
      <ul className="space-y-3">{bandeja.conflictos.map(c => <li key={c.id} className="rounded-xl bg-red-50 p-3">
        <p className="font-semibold">{tipos[c.tipo] ?? c.tipo} · {c.dispositivo} · {hora(c.recibido_en)}{c.datos.folio_offline ? ` · ${String(c.datos.folio_offline)}` : ''}{c.datos.monto ? ` · Q ${Number(c.datos.monto).toFixed(2)}` : ''}{c.datos.referencia_pos ? ` · voucher ${String(c.datos.referencia_pos)}` : ''}</p>
        <p>{c.motivo}</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grow">Qué se hizo<input className="block min-h-12 w-full rounded-xl border bg-white px-3" maxLength={300} value={notas[c.id] ?? ''} onChange={e => setNotas({ ...notas, [c.id]: e.target.value })} /></label>
          <button type="button" className="min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50" disabled={!notas[c.id]?.trim()} onClick={() => void resolver(c.id, 'RESUELTO')}>Marcar resuelto</button>
          <button type="button" className="min-h-12 rounded-xl bg-slate-100 px-4 font-semibold disabled:opacity-50" disabled={!notas[c.id]?.trim()} onClick={() => void resolver(c.id, 'DESCARTADO')}>Descartar</button>
        </div>
      </li>)}</ul>
    </>}
  </section>
}
