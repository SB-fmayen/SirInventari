import { useEffect, useState } from 'react'
import { ErrorApi } from '@/lib/api'
import { convertirCsv } from '@/lib/csv'
import { ReporteAnulaciones } from '@/componentes/ReporteAnulaciones'
import { useSesion } from '@/sesion/SesionProvider'
import { rangoRapido } from '@/lib/fechas'
import { ControlVentas } from '@/componentes/ControlVentas'

interface Fila { nombre: string; cantidad: string; total: string }
interface Reporte {
  desde: string; hasta: string
  resumen: { total_pedidos: number; total_vendido: string; ticket_promedio: string; descuentos: string }
  por_tipo: Fila[]; por_hora: Fila[]; por_producto: Fila[]; por_pago: Fila[]
  pedidos: { id: string; folio: number; fecha_operacion: string; total: string; tipo: string; en_papelera?: boolean }[]
}
interface Historial { folio: number; eventos: { fecha: string; usuario: string; descripcion: string }[] }
const dinero = (valor: string) => `Q ${Number(valor).toFixed(2)}`
const boton = 'min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50'
const campo = 'min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base'
const mensaje = (e: unknown) => e instanceof ErrorApi ? e.message : 'No se pudo consultar el reporte. Intenta de nuevo.'

export function Reportes() {
  const { api, centro } = useSesion()
  const [reporte, setReporte] = useState<Reporte | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [historial, setHistorial] = useState<Historial | null>(null)
  useEffect(() => {
    let vigente = true
    api<Reporte>('/reportes/ventas').then((r) => { if (vigente) { setReporte(r); setDesde(r.desde); setHasta(r.hasta) } })
      .catch((e: unknown) => { if (vigente) setError(mensaje(e)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [api])
  async function consultar() {
    setCargando(true); setError(''); setHistorial(null)
    try { setReporte(await api<Reporte>(`/reportes/ventas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`)) }
    catch (e) { setError(mensaje(e)) }
    finally { setCargando(false) }
  }
  async function verHistorial(id: string) {
    setCargando(true); setError(''); setHistorial(null)
    try { setHistorial(await api<Historial>(`/reportes/pedidos/${id}/historial`)) }
    catch (e) { setError(mensaje(e)) }
    finally { setCargando(false) }
  }
  function descargar() {
    if (!reporte) return
    const filas: (string | number)[][] = [['Centro', 'Desde', 'Hasta', 'Sección', 'Nombre', 'Cantidad', 'Total Q'],
      [centro?.nombre ?? '', reporte.desde, reporte.hasta, 'Resumen', 'Ventas', reporte.resumen.total_pedidos, reporte.resumen.total_vendido],
      [centro?.nombre ?? '', reporte.desde, reporte.hasta, 'Resumen', 'Ticket promedio', '', reporte.resumen.ticket_promedio],
      [centro?.nombre ?? '', reporte.desde, reporte.hasta, 'Resumen', 'Descuentos incluidos', '', reporte.resumen.descuentos]]
    for (const [titulo, datos] of [['Tipo de venta', reporte.por_tipo], ['Hora de Guatemala', reporte.por_hora], ['Producto', reporte.por_producto], ['Forma de pago', reporte.por_pago]] as const) {
      for (const f of datos) filas.push([centro?.nombre ?? '', reporte.desde, reporte.hasta, titulo, f.nombre, f.cantidad, f.total])
    }
    for (const p of reporte.pedidos) filas.push([centro?.nombre ?? '', p.fecha_operacion, p.fecha_operacion, 'Pedido', `Folio ${p.folio} · ${p.tipo}${p.en_papelera ? ' (en papelera)' : ''}`, 1, p.total])
    const url = URL.createObjectURL(new Blob(['\uFEFF', convertirCsv(filas)], { type: 'text/csv;charset=utf-8' }))
    const enlace = document.createElement('a'); enlace.href = url
    enlace.download = `ventas-${centro?.codigo.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}-${reporte.desde}-${reporte.hasta}.csv`
    enlace.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="mx-auto max-w-6xl space-y-5">
    <div><h1 className="text-3xl font-bold">Reportes de ventas</h1><p>{centro?.nombre} · Horas de Guatemala</p></div>
    <p className="text-slate-600">Incluye pedidos pagados del centro y su fecha de operación. Los pedidos con saldo pendiente y los anulados se excluyen. Los descuentos ya están distribuidos en las ventas por producto.</p>
    <div className="flex flex-wrap gap-2">{[['hoy','Hoy'],['ayer','Ayer'],['semana','Esta semana'],['mes','Este mes']].map(([tipo,nombre])=><button type="button" className="min-h-12 rounded-xl border bg-white px-4" disabled={cargando} key={tipo} onClick={()=>{const r=rangoRapido(tipo);setDesde(r.desde);setHasta(r.hasta)}}>{nombre}</button>)}</div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void consultar() }}>
      <label>Desde<input className={`${campo} block`} type="date" required disabled={cargando} value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
      <label>Hasta<input className={`${campo} block`} type="date" required min={desde} disabled={cargando} value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      <button className={boton} disabled={cargando}>Consultar ventas</button>
      <button type="button" className={boton} disabled={cargando || !reporte} onClick={descargar}>Descargar CSV</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {cargando && <p role="status">Consultando…</p>}
    {reporte && <>
      <p>Mostrando del {reporte.desde.split('-').reverse().join('/')} al {reporte.hasta.split('-').reverse().join('/')}.</p>
      <dl className="grid gap-3 sm:grid-cols-4">{[['Pedidos cobrados', String(reporte.resumen.total_pedidos)], ['Total vendido', dinero(reporte.resumen.total_vendido)], ['Ticket promedio', dinero(reporte.resumen.ticket_promedio)], ['Descuentos incluidos', dinero(reporte.resumen.descuentos)]].map(([nombre, valor]) => <div className="rounded-2xl border border-slate-200 bg-white p-4" key={nombre}><dt>{nombre}</dt><dd className="text-2xl font-bold">{valor}</dd></div>)}</dl>
      <div className="grid gap-5 lg:grid-cols-2"><Tabla titulo="Ventas por tipo" filas={reporte.por_tipo} cantidad="Pedidos" /><Tabla titulo="Ventas por hora" filas={reporte.por_hora} cantidad="Pedidos" /><Tabla titulo="Ventas por producto" filas={reporte.por_producto} cantidad="Unidades" /><Tabla titulo="Formas de pago" filas={reporte.por_pago} cantidad="Pagos" /></div>
      <section><h2 className="mb-3 text-2xl font-bold">Pedidos cobrados e historial</h2><ul className="space-y-2">{reporte.pedidos.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"><span>Pedido {p.folio} · {p.fecha_operacion.split('-').reverse().join('/')} · {p.tipo} · {dinero(p.total)}{p.en_papelera && <strong className="ml-2 text-amber-800">En papelera</strong>}</span><button className={boton} disabled={cargando} aria-label={`Ver historial del pedido ${p.folio}`} onClick={() => void verHistorial(p.id)}>Ver historial</button></li>)}</ul>{!reporte.pedidos.length && <p>No hay pedidos pagados en este rango.</p>}</section>
    </>}
    <ControlVentas desde={desde} hasta={hasta}/>
    <ReporteAnulaciones desde={desde} hasta={hasta} />
    {historial && <section className="rounded-2xl border border-teal-200 bg-white p-5"><h2 className="mb-3 text-2xl font-bold">Historial del pedido {historial.folio}</h2><ol className="space-y-3">{historial.eventos.map((e, i) => <li key={i}><p className="font-semibold">{e.usuario} · {new Date(e.fecha).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}</p><p>{e.descripcion}</p></li>)}</ol></section>}
  </div>
}

function Tabla({ titulo, filas, cantidad }: { titulo: string; filas: Fila[]; cantidad: string }) {
  return <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-3 text-xl font-bold">{titulo}</h2><table className="w-full text-left"><thead><tr><th className="py-2">Nombre</th><th className="py-2">{cantidad}</th><th className="py-2">Total</th></tr></thead><tbody>{filas.map((f) => <tr className="border-t border-slate-100" key={f.nombre}><td className="py-2">{f.nombre}</td><td className="py-2">{f.cantidad}</td><td className="py-2">{dinero(f.total)}</td></tr>)}</tbody></table>{!filas.length && <p>No hay ventas.</p>}</section>
}
