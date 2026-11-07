import { useCallback, useEffect, useState } from 'react'
import { ErrorApi } from '@/lib/api'
import { useSesion } from '@/sesion/SesionProvider'
import { useTiempoReal } from '@/hooks/useTiempoReal'
import { nombresCocina, type EstadoCocina } from '@/lib/cocina'
import { AccionControl } from '@/componentes/AccionControl'
import { useCambiosSinGuardar } from '@/hooks/useCambiosSinGuardar'
import { TicketVenta } from '@/componentes/TicketVenta'

interface Pedido {
  id: string; folio: number; fecha_operacion: string; estado: string; estado_cocina: EstadoCocina; total: string; pagado: string; saldo: string
  mesa_referencia: string | null; cliente_nombre: string | null
  subtotal?: string; descuento?: string; creado_en?: string; tipo_venta?: { nombre: string }; usuario?: { nombre: string }; motivo_cortesia?: string | null
  pedido_detalle: { id: string; cantidad: string; importe: string; precio_unitario?: string; notas?: string | null; estado: string; producto: { nombre: string } }[]
}
interface Metodo { id: number; codigo: string; nombre: string; requiere_terminal: boolean; requiere_referencia: boolean }
interface Comprobante {
  centro: { nombre: string }; pedido: Pedido
  pagos: { id: string; monto: string; estado: string; registrado_en?: string; terminal_pos: string | null; referencia_pos: string | null; metodo_pago: { nombre: string } }[]
}
interface Pago { id: string; pedido_id: string; metodo_pago_id: number; monto: string; recibido?: string; terminal_pos?: string; referencia_pos?: string }
const dinero = (valor: string | number) => `Q ${Number(valor).toFixed(2)}`
const boton = 'min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50'
const secundario = 'min-h-12 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 disabled:opacity-50'
const campo = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base'
const mensaje = (e: unknown) => e instanceof ErrorApi ? e.message : 'No se pudo consultar Caja. Intenta de nuevo.'

interface OpcionesCaja {
  pedidoId?: string
  integrado?: boolean
  alBloquear?: (bloqueado: boolean) => void
  alCambiarPedido?: (pedido: Pedido) => void
  alTerminar?: () => void
}

export function Caja({ pedidoId, integrado = false, alBloquear, alCambiarPedido, alTerminar }: OpcionesCaja = {}) {
  const { api, centro, estado } = useSesion()
  const usuario = estado?.tipo === 'activa' ? estado.usuario : null
  const puedeModificar = !!usuario && ['ADMIN', 'GERENTE', 'CAJERO', 'MESERO'].includes(usuario.rol) && (usuario.rol === 'ADMIN' || !usuario.permisos?.some(p => p.modulo === 'pedidos' && ['ver', 'anular'].includes(p.accion) && !p.permitido))
  const [pendientes, setPendientes] = useState<Pedido[]>([])
  const [metodos, setMetodos] = useState<Metodo[]>([])
  const [turnoAbierto, setTurnoAbierto] = useState(false)
  const [comprobante, setComprobante] = useState<Comprobante | null>(null)
  const [buscar, setBuscar] = useState('')
  const [metodoId, setMetodoId] = useState('')
  const [monto, setMonto] = useState('')
  const [recibido, setRecibido] = useState('')
  const [terminal, setTerminal] = useState('')
  const [voucher, setVoucher] = useState('')
  const [vuelto, setVuelto] = useState<string | null>(null)
  const [intento, setIntento] = useState<Pago | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(!!pedidoId)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [fechaHistorial, setFechaHistorial] = useState('')
  const [historial, setHistorial] = useState<Pedido[] | null>(null)
  const [anulacion, setAnulacion] = useState<{ lineaId?: string; nombre?: string } | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [efectivoTicket, setEfectivoTicket] = useState<{ recibido: string; vuelto: string } | null>(null)
  useCambiosSinGuardar(intento !== null || !!terminal || !!voucher || !!anulacion)
  useEffect(() => {
    alBloquear?.(guardando || intento !== null || !!terminal || !!voucher || !!anulacion)
  }, [guardando, intento, terminal, voucher, anulacion, alBloquear])
  useEffect(() => {
    if (!pedidoId) return
    let vigente = true
    api<Comprobante>(`/caja/pedidos/${pedidoId}/comprobante`)
      .then(c => { if (vigente) { setComprobante(c); setMonto(c.pedido.saldo); setRecibido(c.pedido.saldo) } })
      .catch((e: unknown) => { if (vigente) setError(mensaje(e)) })
      .finally(() => { if (vigente) setGuardando(false) })
    return () => { vigente = false }
  }, [api, pedidoId])

  const consultar = useCallback(async () => {
    const [ps, ms, ts] = await Promise.all([api<Pedido[]>('/caja/pendientes'), api<Metodo[]>('/caja/metodos'), api<{ estado: string }[]>('/turnos')])
    return { ps, ms, abierto: ts.some((t) => t.estado === 'ABIERTO') }
  }, [api])
  useEffect(() => {
    let vigente = true
    consultar().then(({ ps, ms, abierto }) => { if (vigente) { setPendientes(ps); setMetodos(ms); setMetodoId(String(ms[0]?.id ?? '')); setTurnoAbierto(abierto) } })
      .catch((e: unknown) => { if (vigente) setError(mensaje(e)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [consultar])
  async function actualizar() {
    try {
      const { ps, ms, abierto } = await consultar(); setPendientes(ps); setMetodos(ms); setTurnoAbierto(abierto)
      if (comprobante) {
        const nuevo = await api<Comprobante>(`/caja/pedidos/${comprobante.pedido.id}/comprobante`)
        // Refresca preparación sin alterar el monto escrito ni un pago en curso.
        setComprobante(actual => actual?.pedido.id === nuevo.pedido.id ? { ...actual, pedido: { ...actual.pedido, estado_cocina: nuevo.pedido.estado_cocina } } : actual)
      }
    }
    catch (e) { setError(mensaje(e)) }
  }
  const conectado = useTiempoReal(actualizar)
  async function elegir(p: Pedido) {
    setGuardando(true); setError(''); setAviso(''); setVuelto(null)
    try {
      const c = await api<Comprobante>(`/caja/pedidos/${p.id}/comprobante`)
      setComprobante(c); setMonto(c.pedido.saldo); setRecibido(c.pedido.saldo); setTerminal(''); setVoucher(''); setIntento(null); setEfectivoTicket(null)
      alCambiarPedido?.(c.pedido)
    } catch (e) { setError(mensaje(e)) }
    finally { setGuardando(false) }
  }
  const metodo = metodos.find((m) => m.id === Number(metodoId))
  async function cobrar() {
    if (!comprobante || !metodo) return
    const datos = intento ?? { id: crypto.randomUUID(), pedido_id: comprobante.pedido.id, metodo_pago_id: metodo.id, monto,
      ...(metodo.codigo === 'EFECTIVO' ? { recibido } : {}),
      ...(metodo.requiere_terminal ? { terminal_pos: terminal } : {}),
      ...(metodo.requiere_referencia ? { referencia_pos: voucher } : {}) }
    setIntento(datos); setGuardando(true); setError(''); setAviso('')
    try {
      const respuesta = await api<{ vuelto: string; comprobante: Comprobante }>('/caja/pagos', { method: 'POST', body: JSON.stringify(datos) })
      setComprobante(respuesta.comprobante); setVuelto(respuesta.vuelto); setIntento(null)
      setEfectivoTicket(datos.recibido !== undefined ? { recibido: datos.recibido, vuelto: respuesta.vuelto } : null)
      alCambiarPedido?.(respuesta.comprobante.pedido)
      setMonto(respuesta.comprobante.pedido.saldo); setRecibido(respuesta.comprobante.pedido.saldo); setTerminal(''); setVoucher('')
      setAviso(respuesta.comprobante.pedido.estado === 'PAGADO' ? 'Pago guardado. Pedido pagado.' : 'Pago parcial guardado. Puedes cobrar el saldo con otra forma de pago.')
      await actualizar()
    } catch (e) {
      if (e instanceof ErrorApi && e.status >= 400 && e.status < 500) setIntento(null)
      setError(mensaje(e))
    } finally { setGuardando(false) }
  }
  const visibles = pendientes.filter((p) => `${p.folio} ${p.fecha_operacion} ${p.mesa_referencia ?? ''} ${p.cliente_nombre ?? ''}`.toLocaleLowerCase('es').includes(buscar.toLocaleLowerCase('es')))
  const puedeCobrar = comprobante && !['PAGADO', 'ANULADO'].includes(comprobante.pedido.estado) && Number(comprobante.pedido.saldo) > 0
  const bloqueado = guardando || intento !== null
  const editable = comprobante && !['PAGADO', 'ANULADO'].includes(comprobante.pedido.estado)
  async function confirmarAnulacion() {
    if (!comprobante || !anulacion || bloqueado) return
    setGuardando(true); setError('')
    try {
      const ruta = anulacion.lineaId ? `/pedidos/${comprobante.pedido.id}/lineas/${anulacion.lineaId}/anulacion` : `/pedidos/${comprobante.pedido.id}/anulacion`
      await api(ruta, { method: 'POST', body: JSON.stringify({ motivo: motivoAnulacion }) })
      setAnulacion(null); setMotivoAnulacion('')
      await elegir(comprobante.pedido)
    } catch (e) { setError(mensaje(e)) }
    finally { setGuardando(false) }
  }

  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div>{integrado ? <h2 className="text-2xl font-bold">{pedidoId ? 'Cobrar pedido' : 'Pendientes y comprobantes'}</h2> : <h1 className="text-3xl font-bold">Caja</h1>}<p>{centro?.nombre}</p></div><button className={secundario} disabled={guardando} onClick={() => void actualizar()}>Actualizar Caja</button></div>
    <p className={conectado ? 'text-teal-800' : 'text-amber-800'}>{conectado ? 'Cambios en tiempo real conectados.' : 'Sin conexión en tiempo real. Reconectando… Puedes actualizar Caja.'}</p>
    {!cargando && !turnoAbierto && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Abre un turno de caja en este centro antes de cobrar.</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {aviso && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{aviso}{vuelto !== null && ` Vuelto: ${dinero(vuelto)}.`}</p>}
    {intento && !guardando && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">No se confirmó el resultado del cobro. Reintenta el mismo pago para verificarlo sin duplicarlo. Conserva esta pantalla abierta.</p>}
    {!pedidoId && <details className="rounded-xl border bg-white p-4"><summary className="min-h-10 cursor-pointer font-semibold">Consultar comprobantes anteriores</summary><form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void api<Pedido[]>(`/caja/historial?fecha=${encodeURIComponent(fechaHistorial)}`).then(setHistorial).catch((e:unknown)=>setError(mensaje(e)))}}><label>Fecha del comprobante<input required className={campo} type="date" value={fechaHistorial} onChange={e=>setFechaHistorial(e.target.value)} /></label><button className={secundario} disabled={bloqueado}>Consultar comprobantes</button></form><ul className="mt-3">{historial?.filter(p=>`${p.folio} ${p.mesa_referencia ?? ''} ${p.cliente_nombre ?? ''}`.toLocaleLowerCase('es').includes(buscar.toLocaleLowerCase('es'))).map(p=><li key={p.id}><button className={`${secundario} my-1`} disabled={bloqueado} onClick={()=>void elegir(p)}>Comprobante {p.folio} · {p.fecha_operacion} · {p.estado} · {dinero(p.total)}</button></li>)}</ul>{historial?.length===0&&<p>No hay comprobantes en esa fecha.</p>}</details>}
    {comprobante && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-2xl font-bold">Pedido {comprobante.pedido.folio} · {comprobante.pedido.fecha_operacion.split('-').reverse().join('/')}</h2>
      <p>{comprobante.pedido.mesa_referencia || comprobante.pedido.cliente_nombre}</p>
      {comprobante.pedido.estado_cocina && <p className="font-semibold text-teal-800">Cocina: {nombresCocina[comprobante.pedido.estado_cocina]}</p>}
      <ul>{comprobante.pedido.pedido_detalle.filter((l) => l.estado === 'ACTIVA').map((l) => <li className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-2" key={l.id}><span>{l.cantidad} × {l.producto.nombre}</span><span>{dinero(l.importe)}</span>{editable && puedeModificar && <button className={secundario} disabled={bloqueado || !!anulacion} aria-label={`Quitar ${l.producto.nombre}`} onClick={() => { setAnulacion({ lineaId: l.id, nombre: l.producto.nombre }); setMotivoAnulacion('') }}>Quitar producto</button>}</li>)}</ul>
      <p className="text-xl font-bold">Total: {dinero(comprobante.pedido.total)} · Pagado: {dinero(comprobante.pedido.pagado)} · Saldo: {dinero(comprobante.pedido.saldo)}</p>
      {editable && puedeModificar && <div><button className="min-h-12 rounded-xl border border-red-200 bg-red-50 px-4 font-semibold text-red-800 disabled:opacity-50" disabled={bloqueado || !!anulacion || Number(comprobante.pedido.pagado) > 0} onClick={() => { setAnulacion({}); setMotivoAnulacion('') }}>Anular pedido</button>{Number(comprobante.pedido.pagado) > 0 && <p className="mt-2 text-sm text-slate-600">Este pedido tiene pagos. Primero deben anularse antes de cancelar el pedido.</p>}</div>}
      {comprobante.pedido.estado === 'ANULADO' && <p role="status" className="rounded-xl bg-red-50 p-4 text-red-800">Pedido anulado. Se conserva en el historial y ya no admite cobros.</p>}
      {anulacion && <form aria-label="Confirmar cambio del pedido" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4" onSubmit={e => { e.preventDefault(); void confirmarAnulacion() }}><h3 className="font-bold">{anulacion.lineaId ? `Quitar ${anulacion.nombre}` : 'Anular el pedido completo'}</h3><p className="text-sm">{anulacion.lineaId ? 'Se recalculará el total. El producto quedará anulado en el historial.' : 'Usa esta opción si el cliente ya no quiere el pedido. Se conserva el historial con el motivo.'}</p><label className="block">Motivo del cambio<input className={campo} required maxLength={200} value={motivoAnulacion} disabled={bloqueado} onChange={e => setMotivoAnulacion(e.target.value)} /></label><div className="flex gap-2"><button className={boton} disabled={bloqueado}>Confirmar {anulacion.lineaId ? 'retiro' : 'anulación'}</button><button type="button" className={secundario} disabled={bloqueado} onClick={() => { setAnulacion(null); setMotivoAnulacion('') }}>Conservar pedido</button></div></form>}
      {puedeCobrar && !anulacion && <form aria-label="Cobrar pedido" className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void cobrar() }}>
        <div className="rounded-xl bg-teal-50 p-4 text-teal-950 sm:col-span-2"><strong>Vas a cobrar el pedido {comprobante.pedido.folio} · {comprobante.pedido.mesa_referencia || comprobante.pedido.cliente_nombre}</strong><p>Total {dinero(comprobante.pedido.total)} · Pagado {dinero(comprobante.pedido.pagado)} · Saldo {dinero(comprobante.pedido.saldo)}</p></div>
        <label>Forma de pago<select required className={campo} disabled={bloqueado} value={metodoId} onChange={(e) => { setMetodoId(e.target.value); setTerminal(''); setVoucher('') }}>{metodos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
        <label>Monto a cobrar<input className={campo} required type="number" min="0.01" max={comprobante.pedido.saldo} step="0.01" disabled={bloqueado} value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
        {metodo?.codigo === 'EFECTIVO' && <><label>Efectivo recibido<input className={campo} required type="number" min={monto} max="9999999999.99" step="0.01" disabled={bloqueado} value={recibido} onChange={(e) => setRecibido(e.target.value)} /></label><p className="self-center">Vuelto previsto: {dinero(Math.max(0, Number(recibido) - Number(monto)))}</p></>}
        {metodo?.codigo === 'EFECTIVO' && <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="button" className={secundario} disabled={bloqueado} onClick={()=>setRecibido(monto)}>Importe exacto</button>{[20,50,100,200].map(n=><button type="button" className={secundario} disabled={bloqueado} key={n} onClick={()=>setRecibido(String(n))}>Recibí Q {n}</button>)}</div>}
        {metodo?.requiere_terminal && <label>Terminal del POS<input required className={campo} maxLength={30} disabled={bloqueado} value={terminal} onChange={(e) => setTerminal(e.target.value)} /></label>}
        {metodo?.requiere_referencia && <label>Número de autorización o referencia<input required className={campo} maxLength={40} disabled={bloqueado} value={voucher} onChange={(e) => setVoucher(e.target.value)} /></label>}
        <button className={boton} disabled={guardando || (!turnoAbierto && !intento) || !metodo}>{intento ? 'Reintentar el mismo pago' : 'Registrar pago'}</button>
      </form>}
      {editable && !bloqueado && !anulacion && comprobante.pedido.pedido_detalle.some(l => l.estado === 'ACTIVA') && <div className="space-y-2"><p className="text-sm text-slate-600"><strong>Cortesía = pedido gratis.</strong> Solo para una atención autorizada por gerente o administrador. Si el cliente ya no lo quiere, usa Anular pedido.</p><AccionControl tipo="CORTESIA" pedidoId={comprobante.pedido.id} etiqueta={Number(comprobante.pedido.total)===0?'Finalizar pedido gratuito':'Solicitar cortesía completa'} alGuardar={()=>elegir(comprobante.pedido)} /></div>}
      {comprobante.pedido.estado === 'PAGADO' && Number(comprobante.pedido.saldo) === 0 && <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" aria-label="Ticket y opciones de impresión"><div><h3 className="text-xl font-bold">Venta completada</h3><p>El pago ya está guardado. Puedes imprimir el ticket o continuar sin papel.</p></div><div className="flex flex-wrap gap-3"><button type="button" className={boton} disabled={bloqueado} onClick={() => window.print()}>Imprimir ticket</button><button type="button" className={secundario} disabled={bloqueado} onClick={() => { if (alTerminar) alTerminar(); else { setComprobante(null); setEfectivoTicket(null) } }}>Continuar sin imprimir</button></div><p className="text-sm text-slate-600">Formato para impresora láser, papel Carta o A4. En la ventana de impresión puedes elegir la impresora o guardar como PDF.</p><TicketVenta datos={comprobante} efectivo={efectivoTicket} /></section>}
      <section aria-label="Comprobante" className="rounded-xl border border-slate-200 p-4"><h3 className="text-xl font-bold">Comprobante · Pedido {comprobante.pedido.folio}</h3><p>{comprobante.centro.nombre} · {comprobante.pedido.fecha_operacion.split('-').reverse().join('/')}</p><p>Total: {dinero(comprobante.pedido.total)}</p><ul>{comprobante.pagos.map((p) => <li className="py-2" key={p.id}>{p.metodo_pago.nombre}: {dinero(p.monto)}{p.estado === 'ANULADO' && ' (anulado)'}{p.referencia_pos && ` · Autorización ${p.referencia_pos}`}{p.terminal_pos && ` · Terminal ${p.terminal_pos}`}{p.estado==='APLICADO'&&<AccionControl tipo="ANULAR_PAGO" pedidoId={comprobante.pedido.id} referencia={p.id} etiqueta={`Anular pago de ${dinero(p.monto)}`} alGuardar={()=>elegir(comprobante.pedido)} />}</li>)}</ul><p>Saldo: {dinero(comprobante.pedido.saldo)}</p></section>
    </section>}
    {!pedidoId && <><label className="block">Buscar pendientes por folio, fecha, mesa o cliente<input className={campo} value={buscar} onChange={(e) => setBuscar(e.target.value)} /></label>
    {cargando ? <p>Cargando Caja…</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibles.map((p) => <button className="min-h-28 rounded-2xl border border-slate-200 bg-white p-4 text-left disabled:opacity-50" disabled={bloqueado} key={p.id} aria-label={`Cobrar pedido ${p.folio}`} onClick={() => void elegir(p)}><span className="block text-xl font-bold">Pedido {p.folio} · Saldo {dinero(p.saldo)}</span><span className="block">{p.fecha_operacion.split('-').reverse().join('/')} · {p.mesa_referencia || p.cliente_nombre}</span>{p.estado_cocina && <span className="mt-2 inline-block rounded-lg bg-teal-50 px-2 py-1 font-semibold text-teal-800">Cocina: {nombresCocina[p.estado_cocina]}</span>}</button>)}</div>}
    {!cargando && !visibles.length && <p>No hay pedidos pendientes con esos filtros.</p>}</>}
  </div>
}
