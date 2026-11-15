import { useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { ErrorApi } from '@/lib/api'
import { convertirCsv } from '@/lib/csv'

interface FilaAnulacion { tipo: string; folio: number; fecha_operacion: string; detalle: string; importe: string | null; motivo: string | null; hecho_por: string | null; autorizado_por: string | null; estado: string; en: string }
interface ReporteAnulacion { desde: string; hasta: string; filas: FilaAnulacion[]; por_usuario: { usuario: string; anulaciones: number; solicitudes: number; autorizadas: number }[] }
const hora = (v: string) => new Date(v).toLocaleString('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// Tarea 15: reporte de anulaciones por usuario (quién pidió, quién autorizó, motivo y hora).
export function ReporteAnulaciones({ desde, hasta }: { desde: string; hasta: string }) {
  const { api, centro } = useSesion()
  const [reporte, setReporte] = useState<ReporteAnulacion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  async function consultar() {
    setCargando(true); setError('')
    try { setReporte(await api<ReporteAnulacion>(`/reportes/anulaciones?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`)) }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo consultar el reporte de anulaciones.') }
    finally { setCargando(false) }
  }
  function descargar() {
    if (!reporte) return
    const filas = [['Fecha y hora', 'Tipo', 'Folio', 'Detalle', 'Importe', 'Motivo', 'Pidió o anuló', 'Autorizó', 'Estado'],
      ...reporte.filas.map(f => [hora(f.en), f.tipo, String(f.folio), f.detalle, f.importe ?? '', f.motivo ?? '', f.hecho_por ?? '', f.autorizado_por ?? '', f.estado])]
    const url = URL.createObjectURL(new Blob(['﻿', convertirCsv(filas)], { type: 'text/csv;charset=utf-8' }))
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `anulaciones-${centro?.codigo?.replaceAll(/[^a-zA-Z0-9_-]/g, '_') ?? 'centro'}-${reporte.desde}-${reporte.hasta}.csv`
    enlace.click(); URL.revokeObjectURL(url)
  }
  return <section aria-label="Anulaciones" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-2xl font-bold">Anulaciones por usuario</h2>
    <p className="text-slate-600">Productos quitados, pagos y pedidos anulados con su motivo, quién lo pidió y quién lo autorizó. Usa las fechas de arriba.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50" disabled={cargando || !desde || !hasta} onClick={() => void consultar()}>{cargando ? 'Consultando…' : 'Consultar anulaciones'}</button>
      <button type="button" className="min-h-12 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 disabled:opacity-50" disabled={!reporte?.filas.length} onClick={descargar}>Descargar CSV de anulaciones</button>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {reporte && !reporte.filas.length && <p>No hubo anulaciones del {reporte.desde.split('-').reverse().join('/')} al {reporte.hasta.split('-').reverse().join('/')}.</p>}
    {reporte && reporte.filas.length > 0 && <>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Usuario</th><th>Anuló o pidió</th><th>Aplicadas</th><th>Autorizó</th></tr></thead>
        <tbody>{reporte.por_usuario.map(u => <tr key={u.usuario} className="border-t"><td className="py-2">{u.usuario}</td><td>{u.solicitudes}</td><td>{u.anulaciones}</td><td>{u.autorizadas}</td></tr>)}</tbody></table></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Hora</th><th>Tipo</th><th>Folio</th><th>Detalle</th><th>Motivo</th><th>Pidió</th><th>Autorizó</th><th>Estado</th></tr></thead>
        <tbody>{reporte.filas.map((f, i) => <tr key={i} className="border-t align-top"><td className="py-2 whitespace-nowrap">{hora(f.en)}</td><td>{f.tipo}</td><td>{f.folio}</td><td>{f.detalle}{f.importe && ` · Q ${Number(f.importe).toFixed(2)}`}</td><td>{f.motivo}</td><td>{f.hecho_por}</td><td>{f.autorizado_por ?? '—'}</td><td>{f.estado}</td></tr>)}</tbody></table></div>
    </>}
  </section>
}
