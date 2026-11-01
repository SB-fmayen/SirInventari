import { useCallback, useEffect, useState } from 'react'
import { ErrorApi } from '@/lib/api'
import { useSesion } from '@/sesion/SesionProvider'

interface Turno {
  id: number; fecha_operacion: string; nombre_apertura: string; abierto_en: string
  nombre_cierre: string | null; cerrado_en: string | null; estado: 'ABIERTO' | 'CERRADO'
  fondo_inicial: string; efectivo_ventas: string; efectivo_esperado: string; efectivo_contado: string | null; diferencia: string | null
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
        method: 'POST', body: JSON.stringify(cerrar ? { efectivo_contado: contado } : { fondo_inicial: fondo }),
      })
      setAviso(cerrar ? `Turno cerrado. Efectivo esperado: ${dinero(t.efectivo_esperado)}. Diferencia: ${dinero(t.diferencia)}.` : 'Turno abierto.')
      setFondo(''); setContado('')
      await cargar()
    } catch (e) {
      setError(mensaje(e))
      // Otro cajero pudo abrir o cerrar el turno mientras se llenaba el formulario.
      await cargar().catch(() => {})
    } finally { setGuardando(false) }
  }

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-3xl font-bold">Turnos de caja</h1><p className="text-slate-600">{centro?.nombre} · Horas de Guatemala</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <button className="underline" onClick={() => void cargar().then(() => setError('')).catch((e: unknown) => setError(mensaje(e)))}>Actualizar</button></p>}
    {aviso && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{aviso}</p>}
    {cargando ? <p>Cargando turnos…</p> : abierto ? <section className="rounded-2xl border border-teal-200 bg-white p-5">
      <h2 className="text-2xl font-bold">Turno abierto</h2><p>Abierto por {abierto.nombre_apertura} · {hora(abierto.abierto_en)}</p>
      <dl className="my-4 grid gap-3 sm:grid-cols-3"><div><dt>Fondo inicial</dt><dd className="text-xl font-semibold">{dinero(abierto.fondo_inicial)}</dd></div><div><dt>Ventas en efectivo</dt><dd className="text-xl font-semibold">{dinero(abierto.efectivo_ventas)}</dd></div><div><dt>Efectivo esperado</dt><dd className="text-xl font-semibold">{dinero(abierto.efectivo_esperado)}</dd></div></dl>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void guardar(true) }}>
        <label>Efectivo contado<input className={campo} required type="number" min="0" max="99999999.99" step="0.01" value={contado} disabled={guardando} onChange={(e) => setContado(e.target.value)} /></label>
        <p className="py-3">Diferencia prevista: {contado === '' ? '—' : dinero((Number(contado) - Number(abierto.efectivo_esperado)).toFixed(2))}</p>
        <button className={boton} disabled={guardando}>Cerrar turno</button>
      </form><p className="mt-3 text-sm text-slate-600">La diferencia final se calcula al cerrar con los pagos guardados. Los pagos anulados y las ventas con tarjeta o transferencia no se suman al efectivo.</p>
    </section> : <form className="rounded-2xl border border-slate-200 bg-white p-5" onSubmit={(e) => { e.preventDefault(); void guardar(false) }}>
      <h2 className="mb-4 text-2xl font-bold">Abrir turno</h2><div className="flex flex-wrap items-end gap-3"><label>Fondo inicial<input required className={campo} type="number" min="0" max="99999999.99" step="0.01" disabled={guardando || !!error} value={fondo} onChange={(e) => setFondo(e.target.value)} /></label><button className={boton} disabled={guardando || !!error}>Abrir turno</button></div>
    </form>}
    <section><h2 className="mb-3 text-2xl font-bold">Historial de turnos</h2><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left"><thead className="bg-slate-50"><tr>{['Día de operación', 'Apertura', 'Cierre', 'Estado', 'Esperado', 'Contado', 'Diferencia'].map((t) => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{turnos.map((t) => <tr key={t.id} className="border-t border-slate-100"><td className="p-3">{t.fecha_operacion.split('-').reverse().join('/')}</td><td className="p-3">{t.nombre_apertura}<span className="block text-sm">{hora(t.abierto_en)}</span></td><td className="p-3">{t.nombre_cierre ?? '—'}<span className="block text-sm">{hora(t.cerrado_en)}</span></td><td className="p-3">{t.estado === 'ABIERTO' ? 'Abierto' : 'Cerrado'}</td><td className="p-3">{dinero(t.efectivo_esperado)}</td><td className="p-3">{dinero(t.efectivo_contado)}</td><td className="p-3">{dinero(t.diferencia)}</td></tr>)}</tbody></table>{!cargando && !turnos.length && <p className="p-4">Todavía no hay turnos en este centro.</p>}</div></section>
  </div>
}
