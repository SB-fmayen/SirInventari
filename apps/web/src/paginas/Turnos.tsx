import { useCallback, useEffect, useState } from 'react'
import { ErrorApi } from '@/lib/api'
import { useSesion } from '@/sesion/SesionProvider'
import { useCambiosSinGuardar } from '@/hooks/useCambiosSinGuardar'

interface Turno {
  id: number; fecha_operacion: string; nombre_apertura: string; abierto_en: string
  nombre_cierre: string | null; cerrado_en: string | null; estado: 'ABIERTO' | 'CERRADO'
  fondo_inicial: string; efectivo_ventas: string; efectivo_esperado: string; efectivo_contado: string | null; diferencia: string | null
  motivo_diferencia?: string | null; movimientos_total?: string; movimiento_caja?: { id:string; tipo:string; monto:string; motivo:string; registrado_en:string; usuario:{nombre:string} }[]
}
const dinero = (valor: string | null) => valor === null ? '—' : `Q ${Number(valor).toFixed(2)}`
const hora = (valor: string | null) => valor ? new Date(valor).toLocaleString('es-GT', { timeZone: 'America/Guatemala' }) : '—'
const boton = 'min-h-12 rounded-xl bg-teal-700 px-5 font-semibold text-white disabled:opacity-50'
const campo = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base'
const mensaje = (e: unknown) => e instanceof ErrorApi ? e.message : 'No se pudo consultar o guardar el turno. Intenta de nuevo.'

export function Turnos() {
  const { api, centro } = useSesion()
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [fondo, setFondo] = useState('')
  const [contado, setContado] = useState('')
  const [motivoDiferencia, setMotivoDiferencia] = useState('')
  const [confirmarPendientes, setConfirmarPendientes] = useState(false)
  const [pendientes, setPendientes] = useState<number | null>(null)
  const [denominaciones, setDenominaciones] = useState<Record<string,string>>({})
  const [movimiento, setMovimiento] = useState({ id: crypto.randomUUID(), tipo: 'INGRESO', monto: '', motivo: '' })
  const [movimientoIncierto, setMovimientoIncierto] = useState(false)
  useCambiosSinGuardar(!!fondo || !!contado || !!movimiento.monto || !!movimiento.motivo)
  const cargar = useCallback(async () => { setTurnos(await api<Turno[]>('/turnos')) }, [api])
  useEffect(() => {
    let vigente = true
    api<Turno[]>('/turnos').then((filas) => { if (vigente) setTurnos(filas) })
      .catch((e: unknown) => { if (vigente) setError(mensaje(e)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [api])
  const abierto = turnos.find((t) => t.estado === 'ABIERTO')

  async function guardar(cerrar: boolean) {
    setGuardando(true); setError(''); setAviso('')
    try {
      const t = await api<Turno>(cerrar ? `/turnos/${abierto!.id}/cierre` : '/turnos', {
        method: 'POST', body: JSON.stringify(cerrar ? { efectivo_contado: contado, motivo_diferencia: motivoDiferencia, confirmar_pendientes: confirmarPendientes } : { fondo_inicial: fondo }),
      })
      setAviso(cerrar ? `Turno cerrado. Efectivo esperado: ${dinero(t.efectivo_esperado)}. Diferencia: ${dinero(t.diferencia)}.` : 'Turno abierto.')
      setFondo(''); setContado(''); setMotivoDiferencia(''); setDenominaciones({}); setConfirmarPendientes(false)
      await cargar()
    } catch (e) {
      setError(mensaje(e))
      // Otro cajero pudo abrir o cerrar el turno mientras se llenaba el formulario.
      await cargar().catch(() => {})
    } finally { setGuardando(false) }
  }

  async function registrarMovimiento() {
    if (!abierto) return
    setGuardando(true); setError(''); setMovimientoIncierto(true)
    try {
      await api(`/turnos/${abierto.id}/movimientos`,{method:'POST',body:JSON.stringify(movimiento)})
      setMovimiento({id:crypto.randomUUID(),tipo:'INGRESO',monto:'',motivo:''}); setMovimientoIncierto(false); setAviso('Movimiento guardado. No se cuenta como venta.'); await cargar()
    } catch(e) { setError(mensaje(e)) } finally { setGuardando(false) }
  }

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-3xl font-bold">Turnos de caja</h1><p className="text-slate-600">{centro?.nombre} · Horas de Guatemala</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <button className="underline" onClick={() => void cargar().then(() => setError('')).catch((e: unknown) => setError(mensaje(e)))}>Actualizar</button></p>}
    {aviso && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{aviso}</p>}
    {turnos.some(t=>!!t.motivo_diferencia)&&<details className="rounded-xl border bg-white p-4"><summary className="min-h-10 cursor-pointer font-semibold">Motivos de diferencias de turnos</summary><ul className="space-y-2">{turnos.filter(t=>!!t.motivo_diferencia).map(t=><li key={t.id}>{t.fecha_operacion} · {t.nombre_cierre} · Diferencia {dinero(t.diferencia)}: {t.motivo_diferencia}</li>)}</ul></details>}
    {cargando ? <p>Cargando turnos…</p> : abierto ? <section className="rounded-2xl border border-teal-200 bg-white p-5">
      <h2 className="text-2xl font-bold">Turno abierto</h2><p>Abierto por {abierto.nombre_apertura} · {hora(abierto.abierto_en)}</p>
      <dl className="my-4 grid gap-3 sm:grid-cols-3"><div><dt>Fondo inicial</dt><dd className="text-xl font-semibold">{dinero(abierto.fondo_inicial)}</dd></div><div><dt>Ventas en efectivo</dt><dd className="text-xl font-semibold">{dinero(abierto.efectivo_ventas)}</dd></div><div><dt>Efectivo esperado</dt><dd className="text-xl font-semibold">{dinero(abierto.efectivo_esperado)}</dd></div></dl>
      <p className="mb-3">Ingresos menos retiros: {dinero(abierto.movimientos_total ?? '0')}</p>
      <details className="my-4 rounded-xl border p-4"><summary className="min-h-10 cursor-pointer font-semibold">Contar billetes y monedas</summary><div className="grid gap-3 sm:grid-cols-4">{[20000,10000,5000,2000,1000,500,100,50,25,10,5,1].map(valor => <label key={valor}>Q {(valor/100).toFixed(2)}<input type="number" min="0" max="999999" step="1" className={campo} value={denominaciones[valor] ?? ''} disabled={guardando} onChange={e => { const ds={...denominaciones,[valor]:e.target.value}; setDenominaciones(ds); if (Object.values(ds).every(v => typeof v === 'string' && /^\d{0,6}$/.test(v))) setContado((Object.entries(ds).reduce((s,[d,c]) => s + Number(d)*Number(c || 0),0)/100).toFixed(2)) }} /></label>)}</div></details>
      <button className="mb-3 min-h-12 rounded-xl border px-4" onClick={() => void api<{pendientes:number}>('/control/resumen').then(r => setPendientes(r.pendientes)).catch((e:unknown) => setError(mensaje(e)))}>Revisar pedidos antes de cerrar</button>
      {pendientes !== null && <p className="mb-3">Pedidos abiertos en este centro: {pendientes}. Pueden seguir abiertos después del cierre; los próximos cobros requieren un turno abierto.</p>}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void guardar(true) }}>
        <label>Efectivo contado<input className={campo} required type="number" min="0" max="99999999.99" step="0.01" value={contado} disabled={guardando} onChange={(e) => setContado(e.target.value)} /></label>
        <p className="py-3">Diferencia prevista: {contado === '' ? '—' : dinero((Number(contado) - Number(abierto.efectivo_esperado)).toFixed(2))}</p>
        {contado !== '' && Number(contado) !== Number(abierto.efectivo_esperado) && <label>Motivo de la diferencia<input className={campo} required maxLength={300} value={motivoDiferencia} disabled={guardando} onChange={e => setMotivoDiferencia(e.target.value)} /></label>}
        <label className="inline-flex min-h-12 items-center gap-2"><input type="checkbox" checked={confirmarPendientes} disabled={guardando} onChange={e => setConfirmarPendientes(e.target.checked)} />Revisé los pedidos abiertos y confirmo el cierre con ellos pendientes</label>
        <button className={boton} disabled={guardando}>Cerrar turno</button>
      </form><p className="mt-3 text-sm text-slate-600">La diferencia final se calcula al cerrar con los pagos guardados. Los pagos anulados y las ventas con tarjeta o transferencia no se suman al efectivo.</p>
      <details className="mt-5 rounded-xl border p-4"><summary className="min-h-10 cursor-pointer font-semibold">Ingresos y retiros de efectivo</summary>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => {e.preventDefault(); void registrarMovimiento()}}>
          <label>Tipo de movimiento<select className={campo} disabled={guardando || movimientoIncierto} value={movimiento.tipo} onChange={e => setMovimiento({...movimiento,tipo:e.target.value})}><option value="INGRESO">Ingreso de cambio</option><option value="RETIRO">Retiro de efectivo</option></select></label>
          <label>Monto del movimiento<input type="number" min="0.01" max="99999999.99" step="0.01" required className={campo} disabled={guardando || movimientoIncierto} value={movimiento.monto} onChange={e => setMovimiento({...movimiento,monto:e.target.value})} /></label>
          <label>Motivo del movimiento<input required maxLength={300} className={campo} disabled={guardando || movimientoIncierto} value={movimiento.motivo} onChange={e => setMovimiento({...movimiento,motivo:e.target.value})} /></label>
          <button className={boton} disabled={guardando}>{movimientoIncierto?'Reintentar el mismo movimiento':'Registrar movimiento'}</button>
        </form>
        <ul className="mt-3 space-y-2">{abierto.movimiento_caja?.map(m => <li className="rounded-xl bg-slate-50 p-3" key={m.id}>{m.tipo} · {dinero(m.monto)} · {m.motivo} · {m.usuario.nombre} · {hora(m.registrado_en)}</li>)}</ul>
      </details>
    </section> : <form className="rounded-2xl border border-slate-200 bg-white p-5" onSubmit={(e) => { e.preventDefault(); void guardar(false) }}>
      <h2 className="mb-4 text-2xl font-bold">Abrir turno</h2><div className="flex flex-wrap items-end gap-3"><label>Fondo inicial<input required className={campo} type="number" min="0" max="99999999.99" step="0.01" disabled={guardando || !!error} value={fondo} onChange={(e) => setFondo(e.target.value)} /></label><button className={boton} disabled={guardando || !!error}>Abrir turno</button></div>
    </form>}
    <section><h2 className="mb-3 text-2xl font-bold">Historial de turnos</h2><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left"><thead className="bg-slate-50"><tr>{['Día de operación', 'Apertura', 'Cierre', 'Estado', 'Esperado', 'Contado', 'Diferencia'].map((t) => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{turnos.map((t) => <tr key={t.id} className="border-t border-slate-100"><td className="p-3">{t.fecha_operacion.split('-').reverse().join('/')}</td><td className="p-3">{t.nombre_apertura}<span className="block text-sm">{hora(t.abierto_en)}</span></td><td className="p-3">{t.nombre_cierre ?? '—'}<span className="block text-sm">{hora(t.cerrado_en)}</span></td><td className="p-3">{t.estado === 'ABIERTO' ? 'Abierto' : 'Cerrado'}</td><td className="p-3">{dinero(t.efectivo_esperado)}</td><td className="p-3">{dinero(t.efectivo_contado)}</td><td className="p-3">{dinero(t.diferencia)}</td></tr>)}</tbody></table>{!cargando && !turnos.length && <p className="p-4">Todavía no hay turnos en este centro.</p>}</div></section>
  </div>
}
