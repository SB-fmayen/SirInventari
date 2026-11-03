import { useCallback, useEffect, useRef, useState } from 'react'
import { ChefHat, Clock3, RefreshCw } from 'lucide-react'
import { useSesion } from '@/sesion/SesionProvider'
import { useTiempoReal } from '@/hooks/useTiempoReal'
import { ErrorApi } from '@/lib/api'
import { nombresCocina, type EstadoCocina } from '@/lib/cocina'
import { AccionControl } from '@/componentes/AccionControl'

interface Comanda {
  id: string; folio: number; fecha_operacion: string; creado_en: string; estado_cocina: EstadoCocina; version: number
  mesa_referencia: string | null; cliente_nombre: string | null; tipo_venta: { nombre: string }
  pedido_detalle: { id: string; cantidad: string; notas: string | null; agregado_en: string; nuevo: boolean; producto: { nombre: string } }[]
}
const columnas: { estado: EstadoCocina; titulo: string; clase: string; accion?: string; siguiente?: EstadoCocina }[] = [
  { estado: 'PENDIENTE', titulo: 'Pendientes', clase: 'border-amber-300 bg-amber-50 text-amber-950', accion: 'Empezar preparación', siguiente: 'EN_PREPARACION' },
  { estado: 'EN_PREPARACION', titulo: 'En preparación', clase: 'border-sky-300 bg-sky-50 text-sky-950', accion: 'Marcar listo', siguiente: 'LISTO' },
  { estado: 'LISTO', titulo: 'Listos', clase: 'border-emerald-300 bg-emerald-50 text-emerald-950', accion: 'Marcar entregado', siguiente: 'ENTREGADO' },
  { estado: 'ENTREGADO', titulo: 'Entregados hoy', clase: 'border-slate-200 bg-slate-100 text-slate-700' },
]
const hora = (fecha: string) => new Date(fecha).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit' })
const mensaje = (e: unknown) => e instanceof ErrorApi ? e.message : 'No se pudo actualizar Cocina. Intenta de nuevo.'

export function Cocina() {
  const { api, centro } = useSesion()
  const [pedidos, setPedidos] = useState<Comanda[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ahora, setAhora] = useState(() => Date.now())
  const [mostrarEntregados, setMostrarEntregados] = useState(false)
  const [sonido, setSonido] = useState(false)
  const sonidoActivo = useRef(false)
  const audio = useRef<AudioContext | null>(null)
  const conocidos = useRef<Map<string, Set<string>> | null>(null)
  const [limite, setLimite] = useState(15)
  const [tipoVenta, setTipoVenta] = useState('')
  const contenedor = useRef<HTMLDivElement>(null)
  const consulta = useRef(0)
  const actualizar = useCallback(async () => {
    const numero = ++consulta.current
    try {
      const lista = await api<Comanda[]>('/cocina')
      if (numero !== consulta.current) return
      if (sonidoActivo.current && conocidos.current && audio.current) {
        const pedidoNuevo = lista.some(p => !conocidos.current!.has(p.id))
        const agregado = lista.some(p => conocidos.current!.has(p.id) && p.pedido_detalle.some(l => !conocidos.current!.get(p.id)!.has(l.id)))
        if (pedidoNuevo || agregado) {
          const ctx = audio.current; void ctx.resume().catch(() => {})
          for (let i=0;i<(pedidoNuevo?2:1);i++) { const os=ctx.createOscillator();const g=ctx.createGain();os.frequency.value=pedidoNuevo?660:880;g.gain.value=.12;os.connect(g);g.connect(ctx.destination);os.start(ctx.currentTime+i*.22);os.stop(ctx.currentTime+i*.22+.15) }
        }
      }
      conocidos.current = new Map(lista.map(p => [p.id,new Set(p.pedido_detalle.map(l=>l.id))]))
      if (numero === consulta.current) { setPedidos(lista); setError(''); setCargando(false) }
    } catch (e) { if (numero === consulta.current) { setError(mensaje(e)); setCargando(false) } }
  }, [api])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- La actualización espera la respuesta de la API.
    void actualizar()
    const reloj = setInterval(() => setAhora(Date.now()), 30000)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Es un contador de solicitudes: se invalida el valor vigente al salir.
    return () => { consulta.current++; clearInterval(reloj) }
  }, [actualizar])
  const conectado = useTiempoReal(actualizar)

  async function avanzar(pedido: Comanda, destino: EstadoCocina) {
    setGuardando(pedido.id); setError(''); setAviso('')
    try {
      await api<Comanda>(`/cocina/${pedido.id}/estado`, { method: 'POST', body: JSON.stringify({ estado_actual: pedido.estado_cocina, estado_cocina: destino, version_actual: pedido.version }) })
      await actualizar()
      setAviso(`Pedido ${pedido.folio}: ${nombresCocina[destino]}.`)
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 409) await actualizar()
      setError(mensaje(e))
    } finally { setGuardando(null) }
  }
  const activos = pedidos.filter(p => p.estado_cocina !== 'ENTREGADO').length
  useEffect(() => () => { void audio.current?.close().catch(() => {}) }, [])
  return <div ref={contenedor} className="mx-auto max-w-screen-2xl space-y-5 bg-slate-50 p-1 fullscreen:overflow-auto fullscreen:p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-orange-100 p-3 text-orange-700"><ChefHat className="size-8" aria-hidden /></span><div><h1 className="text-3xl font-bold text-slate-900">Cocina</h1><p className="text-slate-600">{centro?.nombre} · {activos} pedidos por atender</p></div></div>
      <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-semibold disabled:opacity-50" disabled={!!guardando} onClick={() => void actualizar()}><RefreshCw className="size-5" aria-hidden />Actualizar Cocina</button>
    </div>
    <p role="status" className={`rounded-xl px-4 py-3 ${conectado ? 'bg-teal-50 text-teal-900' : 'bg-amber-50 text-amber-900'}`}>{conectado ? 'Cocina conectada en tiempo real. Los pedidos se actualizan solos.' : 'Sin conexión en tiempo real. Reconectando… Puedes tocar Actualizar Cocina.'}</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {aviso && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{aviso}</p>}
    <div className="flex flex-wrap items-end gap-4"><button className="min-h-12 rounded-xl border bg-white px-4" onClick={() => { try { if (!audio.current) audio.current = new AudioContext(); sonidoActivo.current=!sonido;setSonido(!sonido);if (!sonido) void audio.current.resume() } catch { setAviso('Este navegador no permite activar el sonido.') } }}>{sonido?'Silenciar avisos':'Activar avisos sonoros'}</button>
      <button className="min-h-12 rounded-xl border bg-white px-4" onClick={() => { const operacion = document.fullscreenElement ? document.exitFullscreen?.() : contenedor.current?.requestFullscreen?.(); void operacion?.catch(() => setAviso('El navegador no permite pantalla completa.')) }}>Pantalla completa</button>
      <label>Destacar demora desde<input className="block min-h-12 w-28 rounded-xl border px-3" type="number" min="1" max="180" value={limite} onChange={e=>setLimite(Math.max(1,Math.min(180,Number(e.target.value)||15)))} />minutos</label>
      <label>Tipo de venta<select className="block min-h-12 rounded-xl border px-3" value={tipoVenta} onChange={e=>setTipoVenta(e.target.value)}><option value="">Todos</option>{[...new Set(pedidos.map(p=>p.tipo_venta.nombre))].map(t=><option key={t}>{t}</option>)}</select></label>
    </div>
    <label className="inline-flex min-h-12 cursor-pointer items-center gap-3 font-medium text-slate-700"><input type="checkbox" className="size-5 accent-teal-700" checked={mostrarEntregados} onChange={e => setMostrarEntregados(e.target.checked)} />Mostrar entregados de hoy ({pedidos.filter(p => p.estado_cocina === 'ENTREGADO').length})</label>
    {cargando ? <p>Cargando Cocina…</p> : <div className={`grid items-start gap-4 md:grid-cols-2 ${mostrarEntregados ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
      {columnas.filter(c => mostrarEntregados || c.estado !== 'ENTREGADO').map(columna => {
        const lista = pedidos.filter(p => p.estado_cocina === columna.estado && (!tipoVenta || p.tipo_venta.nombre === tipoVenta))
        return <section key={columna.estado} aria-label={columna.titulo} className="space-y-3">
          <h2 className={`flex items-center justify-between rounded-xl border px-4 py-3 text-lg font-bold ${columna.clase}`}>{columna.titulo}<span className="rounded-lg bg-white/70 px-2">{lista.length}</span></h2>
          {!lista.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-slate-500">Sin pedidos en esta sección.</p>}
          {lista.map(p => <article key={p.id} aria-label={`Pedido ${p.folio}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {p.estado_cocina !== 'ENTREGADO' && ahora-new Date(p.creado_en).getTime() >= limite*60000 && <p className="bg-red-100 px-4 py-2 font-bold text-red-900">Demora: supera {limite} minutos</p>}
            <div className="space-y-2 border-b border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-2xl font-bold text-slate-900">Pedido {p.folio}</h3>{p.estado_cocina !== 'ENTREGADO' && <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700"><Clock3 className="size-4" aria-hidden />{Math.max(0, Math.floor((ahora - new Date(p.creado_en).getTime()) / 60000))} min de espera</span>}</div><p className="font-semibold text-slate-800">{p.mesa_referencia || p.cliente_nombre}</p><p className="text-sm text-slate-500">{p.tipo_venta.nombre} · {p.fecha_operacion.split('-').reverse().join('/')} · {hora(p.creado_en)}</p></div>
            <ul className="space-y-3 p-4">{p.pedido_detalle.map(l => <li key={l.id} className={`rounded-xl p-3 ${l.nuevo ? 'border border-amber-300 bg-amber-50' : 'bg-slate-50'}`}>
              {l.nuevo && <span className="mb-1 inline-block rounded-md bg-amber-200 px-2 py-1 text-xs font-bold text-amber-950">NUEVO · {hora(l.agregado_en)}</span>}
              <p className="text-lg font-bold text-slate-900">{Number(l.cantidad)} × {l.producto.nombre}</p>
              {l.notas && <p className="mt-2 rounded-lg bg-white p-2 font-medium text-orange-900">Notas: {l.notas}</p>}
            </li>)}</ul>
            {columna.siguiente && <div className="px-4 pb-4"><button type="button" aria-label={`${columna.accion}: pedido ${p.folio}`} disabled={!!guardando} className="min-h-14 w-full rounded-xl bg-teal-700 px-4 text-lg font-bold text-white hover:bg-teal-800 disabled:opacity-50" onClick={() => void avanzar(p, columna.siguiente!)}>{guardando === p.id ? 'Guardando…' : columna.accion}</button></div>}
            {p.estado_cocina !== 'PENDIENTE' && <div className="p-4"><AccionControl pedidoId={p.id} tipo="RETROCEDER_COCINA" etiqueta="Corregir avance de cocina" alGuardar={actualizar} /></div>}
          </article>)}
        </section>
      })}
    </div>}
  </div>
}
