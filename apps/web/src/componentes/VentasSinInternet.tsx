import { useEffect, useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { encolar } from '@/lib/cola'
import { useColaSinInternet } from '@/hooks/useColaSinInternet'
import type { OperacionCola } from '@/lib/sinConexion'

interface Metodo { id: number; codigo: string; nombre: string; requiere_terminal: boolean; requiere_referencia: boolean }
export interface VentaLocal { id: string; folio: string | null; total: string }
const campo = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base'
const boton = 'min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50'
const secundario = 'min-h-12 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 disabled:opacity-50'
const dinero = (v: string | number) => `Q ${Number(v).toFixed(2)}`

/** Tarea 18 · Modo mostrador sin internet: la caja cobra y el cobro queda en la cola del equipo. */
export function CobroSinInternet({ venta, alTerminar }: { venta: VentaLocal; alTerminar: (resumen: { vuelto: number; metodo: string; monto: string; referencia?: string }) => void }) {
  const { api, centro, estado } = useSesion()
  const [metodos, setMetodos] = useState<Metodo[]>([])
  const [metodoId, setMetodoId] = useState('')
  const [recibido, setRecibido] = useState('')
  const [terminal, setTerminal] = useState('')
  const [voucher, setVoucher] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    api<Metodo[]>('/caja/metodos').then(m => { setMetodos(m); setMetodoId(String((m.find(x => x.codigo === 'EFECTIVO') ?? m[0])?.id ?? '')) })
      .catch(() => setError('Este equipo no tiene guardadas las formas de pago. Abre Caja una vez con internet para guardarlas.'))
  }, [api])
  const metodo = metodos.find(m => String(m.id) === metodoId)
  const efectivo = metodo?.codigo === 'EFECTIVO'
  const vuelto = Math.max(0, Number(recibido || 0) - Number(venta.total))
  async function cobrar() {
    if (!metodo || !centro || estado.tipo !== 'activa') return
    if (efectivo && Number(recibido || venta.total) < Number(venta.total)) { setError('El efectivo recibido es menor que el total.'); return }
    await encolar({ id: crypto.randomUUID(), centro_id: centro.id, usuario_id: estado.usuario.id, tipo: 'PAGO', datos: {
      id: crypto.randomUUID(), pedido_id: venta.id, metodo_pago_id: metodo.id, monto: Number(venta.total).toFixed(2), registrado_en: new Date().toISOString(),
      ...(metodo.requiere_terminal ? { terminal_pos: terminal.trim() } : {}), ...(metodo.requiere_referencia ? { referencia_pos: voucher.trim() } : {}),
    } })
    alTerminar({ vuelto: efectivo ? vuelto : 0, metodo: metodo.nombre, monto: venta.total, ...(metodo.requiere_referencia ? { referencia: voucher.trim() } : {}) })
  }
  return <form aria-label="Cobro sin internet" className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5" onSubmit={e => { e.preventDefault(); void cobrar() }}>
    <h2 className="text-2xl font-bold">Cobrar sin internet · {venta.folio}</h2>
    <p>Total a cobrar: <strong className="text-xl">{dinero(venta.total)}</strong>. El cobro se guarda en este equipo y se envía solo al volver la conexión.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Forma de pago<select className={campo} required value={metodoId} onChange={e => setMetodoId(e.target.value)}>{metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
      {efectivo && <label>Efectivo recibido<input className={campo} type="number" min={venta.total} step="0.01" placeholder={venta.total} value={recibido} onChange={e => setRecibido(e.target.value)} /></label>}
      {efectivo && <p className="self-center text-lg font-semibold">Vuelto: {dinero(vuelto)}</p>}
      {metodo?.requiere_terminal && <label>Terminal del POS<input className={campo} required maxLength={30} value={terminal} onChange={e => setTerminal(e.target.value)} /></label>}
      {metodo?.requiere_referencia && <label>Número de autorización o referencia<input className={campo} required maxLength={40} value={voucher} onChange={e => setVoucher(e.target.value)} /></label>}
    </div>
    {metodo?.requiere_terminal && <p className="text-sm">Con tarjeta solo si el POS tiene su propia conexión y aprobó el cobro.</p>}
    <button className={`${boton} w-full`} disabled={!metodo}>Guardar cobro sin internet</button>
  </form>
}

const textoEstado = (o: OperacionCola) => o.estado === 'PENDIENTE' || o.estado === 'ENVIANDO' ? 'Pendiente de enviar'
  : o.estado === 'CONFLICTO' ? `En revisión del gerente: ${String(o.resultado?.motivo ?? 'no se pudo aplicar')}`
  : o.tipo === 'PEDIDO' && o.resultado?.folio ? `Enviado · folio definitivo ${String(o.resultado.folio)}` : 'Enviado'

/** Lo hecho sin internet en este equipo, con su estado de envío. */
export function ColaEnEquipo({ alCobrar }: { alCobrar?: (venta: VentaLocal) => void }) {
  const { operaciones, pendientes, conflictos, enviando, enviar } = useColaSinInternet()
  if (!operaciones.length) return null
  const pedidos = operaciones.filter(o => o.tipo === 'PEDIDO')
  const pagado = (id: unknown) => operaciones.some(o => o.tipo === 'PAGO' && o.datos.pedido_id === id && o.estado !== 'CONFLICTO')
  const total = (o: OperacionCola) => Number(o.datos.total ?? 0).toFixed(2)
  return <section aria-label="Ventas sin internet de este equipo" className="space-y-3 rounded-2xl border border-amber-300 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">Ventas sin internet en este equipo</h2>
      <button type="button" className={secundario} disabled={enviando || !pendientes} onClick={() => void enviar()}>{enviando ? 'Enviando…' : `Enviar ahora (${pendientes})`}</button>
    </div>
    {conflictos > 0 && <p className="rounded-xl bg-red-50 p-3 text-red-800">{conflictos} {conflictos === 1 ? 'operación quedó' : 'operaciones quedaron'} en la bandeja del gerente. No se perdió nada.</p>}
    <ul className="space-y-2">{pedidos.slice().reverse().map(o => <li key={o.orden} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
      <span><strong>{String(o.datos.folio_offline ?? 'Agregado')}</strong> · {new Date(o.creado_en).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit' })}{o.datos.total !== undefined && ` · ${dinero(total(o))}`}{pagado(o.datos.id) && ' · Cobrado'}</span>
      <span className={o.estado === 'CONFLICTO' ? 'text-red-800' : o.estado === 'PENDIENTE' ? 'text-amber-800' : 'text-emerald-800'}>{textoEstado(o)}</span>
      {alCobrar && o.datos.folio_offline != null && !pagado(o.datos.id) && o.estado !== 'CONFLICTO' && <button type="button" className={secundario} onClick={() => alCobrar({ id: String(o.datos.id), folio: String(o.datos.folio_offline), total: total(o) })}>Cobrar</button>}
    </li>)}</ul>
  </section>
}
