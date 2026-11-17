import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { ErrorApi } from '@/lib/api'
import { convertirCsv } from '@/lib/csv'
import { useSesion } from '@/sesion/SesionProvider'

interface Importes { cobrado: string; comision: string; iva: string; descuento: string; neto: string }
interface Simulacion {
  desde: string; hasta: string; terminal: string | null
  porcentaje_comision: string; porcentaje_iva: string
  totales: Importes; dias: (Importes & { fecha: string })[]
  total_pedidos: number; total_cobros: number
  pedidos: { id: string; folio: number; fecha_operacion: string; cliente: string | null; en_papelera: boolean; cobros: number; monto: string; incluido: boolean }[]
  cobros: { id: string; pedido_id: string; folio: number; fecha_pedido: string; fecha: string; monto: string; terminal: string | null; autorizacion: string | null }[]
}
const dinero = (valor: string) => `Q ${Number(valor).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fecha = (valor: string) => valor.split('-').reverse().join('/')
const boton = 'min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50'
const secundario = 'min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold disabled:opacity-50'
const campo = 'min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base'

export function SimuladorComisiones({ desde, hasta }: { desde: string; hasta: string }) {
  const { api, centro } = useSesion()
  const [reporte, setReporte] = useState<Simulacion | null>(null)
  const [terminal, setTerminal] = useState('')
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [buscar, setBuscar] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const seleccionCambio = !!reporte && reporte.pedidos.some(p => p.incluido !== seleccion.includes(p.id))
  const todos = !!reporte && seleccion.length === reporte.pedidos.length
  const excede = !todos && seleccion.length > 100
  const resultadoVigente = reporte && !seleccionCambio && !error && !cargando

  async function consultar(soloSeleccion: boolean) {
    setCargando(true); setError('')
    const parametros = new URLSearchParams({ desde, hasta })
    if (terminal.trim()) parametros.set('terminal', terminal)
    if (soloSeleccion && !todos) parametros.set('pedidos', seleccion.join(','))
    try {
      const datos = await api<Simulacion>(`/reportes/comisiones?${parametros}`)
      setReporte(datos); setSeleccion(datos.pedidos.filter(p => p.incluido).map(p => p.id))
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo calcular la comisión. Intenta de nuevo.')
    } finally { setCargando(false) }
  }

  function descargar() {
    if (!resultadoVigente) return
    const filas: (string | number)[][] = [
      ['Simulador de comisiones Cubo', centro?.nombre ?? '', reporte.desde, reporte.hasta],
      ['Terminal', reporte.terminal ?? 'Todas las terminales'],
      ['Comisión %', reporte.porcentaje_comision, 'IVA sobre la comisión %', reporte.porcentaje_iva],
      ['Pedidos incluidos', reporte.total_pedidos, 'Cobros incluidos', reporte.total_cobros],
      ['Fecha del cobro', 'Cobrado POS Q', 'Comisión Q', 'IVA de comisión Q', 'Descuento total Q', 'Depósito estimado Q'],
      ...reporte.dias.map(d => [d.fecha, d.cobrado, d.comision, d.iva, d.descuento, d.neto]),
      ['TOTAL', reporte.totales.cobrado, reporte.totales.comision, reporte.totales.iva, reporte.totales.descuento, reporte.totales.neto],
      [], ['Fecha del cobro', 'Fecha del pedido', 'Folio', 'Terminal', 'Autorización', 'Cobrado POS Q'],
      ...reporte.cobros.map(c => [c.fecha, c.fecha_pedido, c.folio, c.terminal ?? '', c.autorizacion ?? '', c.monto]),
    ]
    const url = URL.createObjectURL(new Blob(['\uFEFF', convertirCsv(filas)], { type: 'text/csv;charset=utf-8' }))
    const enlace = document.createElement('a'); enlace.href = url
    enlace.download = `comisiones-cubo-${centro?.codigo?.replaceAll(/[^a-zA-Z0-9_-]/g, '_') ?? 'centro'}-${reporte.desde}-${reporte.hasta}.csv`
    enlace.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const visibles = reporte?.pedidos.filter(p => `${p.folio} ${p.cliente ?? ''} ${fecha(p.fecha_operacion)}`.toLocaleLowerCase('es').includes(buscar.trim().toLocaleLowerCase('es'))) ?? []
  return <section aria-label="Simulador de comisiones" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex items-center gap-3"><Calculator className="size-6 text-teal-700" aria-hidden /><div><h2 className="text-2xl font-bold">Simulador de comisiones</h2><p className="text-sm font-semibold text-slate-500">Cubo · Comisión 5.50% + IVA del 12% sobre la comisión</p></div></div>
    <p className="text-slate-600">Usa las fechas de arriba para sumar lo cobrado por tarjeta cada día, en hora de Guatemala. Incluye abonos y pagos divididos; excluye efectivo, transferencias y pagos anulados.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void consultar(reporte !== null) }}>
      <label className="flex flex-col gap-1">Terminal POS (opcional)<input className={campo} value={terminal} maxLength={30} disabled={cargando} placeholder="Todas las terminales" onChange={e => { setTerminal(e.target.value); setReporte(null); setSeleccion([]); setError(''); setBuscar('') }} /></label>
      <button className={boton} disabled={cargando || !desde || !hasta || excede || (!!reporte?.pedidos.length && !seleccion.length)}>Calcular comisiones</button>
      <button type="button" className={secundario} disabled={!resultadoVigente || !reporte?.total_cobros} onClick={descargar}>Descargar CSV de comisiones</button>
    </form>
    <p className="text-sm text-slate-500">Sin terminal se aplica la tarifa de Cubo a todos los cobros por tarjeta del centro. Escribe la terminal registrada en Caja si necesitas separar un POS.</p>
    {cargando && <p role="status">Calculando comisiones…</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
    {reporte && <>
      <p className="font-medium">Cobros del {fecha(reporte.desde)} al {fecha(reporte.hasta)} · {reporte.terminal ?? 'Todas las terminales'}</p>
      {!!reporte.pedidos.length && <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer py-2 font-semibold">Filtrar por pedidos · {seleccion.length} de {reporte.pedidos.length} seleccionados</summary>
        <div className="mt-3 space-y-3">
          <label className="flex flex-col gap-1">Buscar pedidos para seleccionar<input className={campo} value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Folio, cliente o fecha del pedido" /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secundario} disabled={cargando} onClick={() => setSeleccion(reporte.pedidos.map(p => p.id))}>Seleccionar todos</button>
            <button type="button" className={secundario} disabled={cargando} onClick={() => setSeleccion([])}>Quitar selección</button>
            <button type="button" className={secundario} disabled={cargando || !visibles.length} onClick={() => setSeleccion(visibles.map(p => p.id))}>Seleccionar solo resultados</button>
            <button type="button" className={boton} disabled={cargando || !seleccion.length || excede} onClick={() => void consultar(true)}>Calcular selección</button>
          </div>
          <p className="text-sm text-slate-500">La búsqueda localiza pedidos; marca los que deseas incluir y pulsa Calcular selección. Puedes elegir hasta 100 pedidos o todos.</p>
          {excede && <p role="alert">Elige hasta 100 pedidos o usa Seleccionar todos.</p>}
          <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Pedidos disponibles para simular comisiones</caption><thead><tr><th className="p-2">Incluir</th><th className="p-2">Pedido</th><th className="p-2">Cliente</th><th className="p-2 text-right">Cobros POS</th><th className="p-2 text-right">Cobrado POS</th></tr></thead><tbody>
            {visibles.map(p => <tr key={p.id} className="border-t border-slate-100"><td className="p-2"><input type="checkbox" className="size-5 accent-teal-700" aria-label={`Incluir pedido ${p.folio} del ${fecha(p.fecha_operacion)}`} checked={seleccion.includes(p.id)} disabled={cargando} onChange={e => setSeleccion(actual => e.target.checked ? [...actual, p.id] : actual.filter(id => id !== p.id))} /></td><td className="p-2">#{p.folio} · {fecha(p.fecha_operacion)}{p.en_papelera && <span className="block text-amber-800">En papelera</span>}</td><td className="p-2">{p.cliente ?? 'Cliente de mostrador'}</td><td className="p-2 text-right">{p.cobros}</td><td className="p-2 text-right whitespace-nowrap">{dinero(p.monto)}</td></tr>)}
          </tbody></table>{!visibles.length && <p className="p-3">No hay pedidos que coincidan con la búsqueda.</p>}</div>
        </div>
      </details>}
      {seleccionCambio && <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">Cambiaste la selección. Pulsa Calcular selección para actualizar los importes.</p>}
      {resultadoVigente && <>
        <p>{reporte.total_pedidos} {reporte.total_pedidos === 1 ? 'pedido' : 'pedidos'} · {reporte.total_cobros} {reporte.total_cobros === 1 ? 'cobro' : 'cobros'} incluidos en el cálculo.</p>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
          ['Cobrado por POS', reporte.totales.cobrado], ['Comisión Cubo · 5.50%', reporte.totales.comision],
          ['IVA de comisión · 12%', reporte.totales.iva], ['Descuento total', reporte.totales.descuento], ['Depósito estimado', reporte.totales.neto],
        ].map(([nombre, valor], i) => <div key={nombre} className={`rounded-xl border p-4 ${i === 4 ? 'border-teal-700 bg-teal-50 text-teal-950' : 'border-slate-200 bg-slate-50'}`}><dt className="text-sm">{nombre}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{dinero(valor)}</dd></div>)}</dl>
        {!reporte.total_cobros ? <p>No hay cobros por tarjeta para estos filtros.</p> : <div className="overflow-x-auto"><table className="w-full text-right text-sm"><caption className="mb-2 text-left text-lg font-semibold">Detalle por día de cobro</caption><thead><tr><th className="p-2 text-left">Día</th><th className="p-2">Cobrado POS</th><th className="p-2">Comisión</th><th className="p-2">IVA de comisión</th><th className="p-2">Descuento total</th><th className="p-2">Depósito estimado</th></tr></thead><tbody>{reporte.dias.map(d => <tr className="border-t border-slate-100" key={d.fecha}><td className="p-2 text-left">{fecha(d.fecha)}</td>{[d.cobrado, d.comision, d.iva, d.descuento, d.neto].map((v, i) => <td key={i} className={`whitespace-nowrap p-2 tabular-nums ${i === 4 ? 'font-bold text-teal-800' : ''}`}>{dinero(v)}</td>)}</tr>)}</tbody></table></div>}
        <p className="text-sm text-slate-600">Por día: cobrado × 5.50% = comisión; comisión × 12% = IVA; cobrado − comisión − IVA = depósito estimado. Cada importe se redondea a centavos y el rango suma los resultados diarios. Es una estimación con la tarifa indicada; no confirma un depósito bancario.</p>
      </>}
    </>}
  </section>
}
