import { permisoClientes } from '@/lib/clientes'
import { BuscarCliente, MovimientoPapelera } from '@/componentes/ClientesCompartidos'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorApi } from '@/lib/api'
import { useSesion } from '@/sesion/SesionProvider'
import { useTiempoReal } from '@/hooks/useTiempoReal'
import { totalLineas } from '@/lib/importes'
import { nombresCocina, type EstadoCocina } from '@/lib/cocina'
import { useCambiosSinGuardar } from '@/hooks/useCambiosSinGuardar'
import { leerBorrador } from '@/lib/borrador'
import { Caja } from '@/paginas/Caja'
import { AccionControl } from '@/componentes/AccionControl'
import { CobroSinInternet, ColaEnEquipo, type VentaLocal } from '@/componentes/VentasSinInternet'
import { useColaSinInternet } from '@/hooks/useColaSinInternet'
import { encolar, siguienteFolioProvisional } from '@/lib/cola'
import { dispositivoActual } from '@/lib/sinConexion'
import { BotonImprimir, type DatosComanda } from '@/componentes/Comanda'
import { Bike, Check, ImageOff, Minus, Plus, Receipt, Search, ShoppingBag, ShoppingCart, Smartphone, StickyNote, Trash2, User, Utensils, type LucideIcon } from 'lucide-react'

/** Datos de la última venta sin internet (para el aviso y la comanda impresa, Tarea 19). */
export interface VentaSinInternetResumen { id: string; folio: string | null; total: string; tipo: string; cliente: string; hora: string; lineas: { nombre: string; cantidad: string; notas: string; importe?: string }[]; pago?: { metodo: string; monto: string; vuelto?: number; referencia?: string } }
const comandaDe = (v: VentaSinInternetResumen): DatosComanda => ({ folio: v.folio ?? 'Agregado', provisional: true, tipo: v.tipo, cliente: v.cliente, hora: v.hora, lineas: v.lineas, total: v.total, pago: v.pago })

interface Producto { id: number; nombre: string; sku: string; precio: string; categoria: { id: number; nombre: string }; grupo_variantes?:string|null; es_complemento?:boolean; foto_datos?:string|null }
interface TipoVenta { id: number; codigo: string; nombre: string }
interface Linea {
  id: string; producto_id: number; cantidad: string; precio_unitario: string; importe: string; notas: string | null
  estado: string; agregado_en: string; motivo_anulacion: string | null
  producto: { nombre: string }; usuario_pedido_detalle_agregado_porTousuario: { nombre: string }
}
interface Pedido {
  cliente_telefono?: string | null; cliente_direccion?: string | null; version: number; eliminado_en?: string | null
  id: string; folio: number; tipo_venta_id: number; mesa_referencia: string | null; cliente_nombre: string | null
  estado: string; estado_cocina: EstadoCocina; total: string; pagado: string; saldo: string; creado_en: string
  tipo_venta: { nombre: string }; usuario: { nombre: string }; pedido_detalle: Linea[]
  fecha_operacion?: string
  folio_offline?: string | null
}
interface BorradorLinea { id: string; producto_id: number; cantidad: string; notas: string }
interface Borrador { id: string; tipo_venta_id: string; mesa_referencia: string; cliente_nombre: string; cliente_telefono?: string; cliente_direccion?: string; cliente_id?: string | null; cliente_version?: number | null; actualizar_cliente?: boolean; lineas: BorradorLinea[] }
const boton = 'min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50'
const secundario = 'min-h-12 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 disabled:opacity-50'
const campo = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base'
const dinero = (valor: string | number) => `Q ${Number(valor).toFixed(2)}`
const hora = (valor: string) => new Date(valor).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit' })
const estados: Record<string, string> = { ABIERTO: 'Abierto', EN_PREPARACION: 'En preparación', LISTO: 'Listo', ENTREGADO: 'Entregado', PAGADO: 'Pagado', ANULADO: 'Anulado' }
const tiposConocidos: Record<string, { icono: LucideIcon; nombre: string; ayuda: string }> = {
  MESA: { icono: Utensils, nombre: 'Comer en mesa', ayuda: 'Se queda a comer aquí' },
  LLEVAR: { icono: ShoppingBag, nombre: 'Para llevar', ayuda: 'Se lo lleva en bolsa' },
  PARA_LLEVAR: { icono: ShoppingBag, nombre: 'Para llevar', ayuda: 'Se lo lleva en bolsa' },
  DOMICILIO: { icono: Bike, nombre: 'A domicilio', ayuda: 'Pide teléfono y dirección' },
  APP: { icono: Smartphone, nombre: 'App de entregas', ayuda: 'Pedido de una app' },
}
const infoTipo = (t: TipoVenta) => tiposConocidos[t.codigo] ?? { icono: Receipt, nombre: t.nombre, ayuda: '' }
const notasFrecuentes = ['Sin cebolla', 'Sin picante', 'Bien cocido', 'Para compartir']
const alternarNota = (notas: string, nota: string) => {
  const partes = notas.split('; ').map(n => n.trim()).filter(Boolean)
  return (partes.includes(nota) ? partes.filter(n => n !== nota) : [...partes, nota]).join('; ').slice(0, 200)
}
const mensaje = (e: unknown) => e instanceof ErrorApi ? e.message : 'No se pudo consultar o guardar el pedido. Intenta de nuevo.'

export function Pedidos({ iniciarCobros = false }: { iniciarCobros?: boolean } = {}) {
  const { api, centro, estado: sesion } = useSesion()
  const usuario = sesion?.tipo === 'activa' ? sesion.usuario : null
  const puedeTomarPedidos = !usuario || usuario.rol === 'ADMIN' || !usuario.permisos?.some(p => p.modulo === 'pedidos' && p.accion === 'ver' && !p.permitido)
  const puedeCobrar = !!usuario && ['ADMIN', 'GERENTE', 'CAJERO'].includes(usuario.rol) && !usuario.permisos?.some(p => p.modulo === 'caja' && p.accion === 'ver' && !p.permitido)
  const [cobro, setCobro] = useState<{ id?: string } | null>(iniciarCobros && puedeCobrar ? {} : null)
  const [cobroBloqueado, setCobroBloqueado] = useState(false)
  const claveBorrador = `sirinventari.borrador.${sesion?.tipo === 'activa' ? sesion.usuario.id : ''}.${centro?.id}`
  const [recuperable, setRecuperable] = useState(() => leerBorrador(claveBorrador))
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [tipos, setTipos] = useState<TipoVenta[]>([])
  const [seleccionado, setSeleccionado] = useState<Pedido | null>(null)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [fechaPedidos, setFechaPedidos] = useState('')
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [eliminarPedido, setEliminarPedido] = useState<Pedido | null>(null)
  const [ventaLocal, setVentaLocal] = useState<VentaLocal | null>(null)
  const [ultimaSinInternet, setUltimaSinInternet] = useState<VentaSinInternetResumen | null>(null)
  useColaSinInternet({ automatico: true })
  const esGerente = !usuario || ['ADMIN', 'GERENTE'].includes(usuario.rol)
  const puedeEliminar =!!usuario && ['ADMIN','GERENTE'].includes(usuario.rol) && permisoClientes(usuario,'pedidos','anular') && permisoClientes(usuario,'papelera','anular')
  const [filtroPedido, setFiltroPedido] = useState('TODOS')
  const [verAnteriores, setVerAnteriores] = useState(false)
  const inicioRapido=useRef(false)
  const [filtro, setFiltro] = useState('')
  const [buscarProducto, setBuscarProducto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [anulando, setAnulando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [reciente, setReciente] = useState<string | null>(null)
  const listaTicket = useRef<HTMLDivElement>(null)
  useCambiosSinGuardar(!!borrador || !!anulando)
  useEffect(() => {
    if (borrador && !agregando) {
      try { localStorage.setItem(claveBorrador, JSON.stringify(borrador)) } catch { queueMicrotask(()=>setAviso('No se pudo conservar el borrador en este dispositivo. No salgas antes de guardar.')) }
    }
  }, [borrador, agregando, claveBorrador])
  const cargar = useCallback(async () => {
    if (!puedeTomarPedidos) return { ps: [], menu: [], ts: [] }
    const [ps, menu, ts] = await Promise.all([api<Pedido[]>(fechaPedidos ? `/pedidos?fecha=${fechaPedidos}` : verAnteriores ? '/pedidos?anteriores=1' : '/pedidos').catch((e: unknown) => { if (e instanceof ErrorApi && e.status === 0) return [] as Pedido[]; throw e }), api<Producto[]>('/pedidos/catalogo'), api<TipoVenta[]>('/pedidos/tipos')])
    return { ps, menu, ts }
  }, [api, verAnteriores, puedeTomarPedidos, fechaPedidos])
  useEffect(() => {
    let vigente = true
    cargar().then(({ ps, menu, ts }) => { if (vigente) { setPedidos(ps); setProductos(menu); setTipos(ts) } })
      .catch((e: unknown) => { if (vigente) setError(mensaje(e)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [cargar])
  useEffect(()=>{
    if(!inicioRapido.current&&tipos.length&&!recuperable&&new URLSearchParams(window.location.search).get('nuevo')==='1'){
      inicioRapido.current=true
      setBorrador({id:crypto.randomUUID(),tipo_venta_id:String((tipos.find(t => t.codigo === 'LLEVAR') ?? tipos.find(t => t.codigo === 'PARA_LLEVAR') ?? tipos[0]).id),mesa_referencia:'',cliente_nombre:'',lineas:[]})
    }
  },[tipos,recuperable])

  async function actualizar() {
    try {
      const { ps, menu, ts } = await cargar()
      setPedidos(ps); setProductos(menu); setTipos(ts); setError('')
      setSeleccionado((actual) => actual ? ps.find((p) => p.id === actual.id) ?? null : null)
    } catch (e) { setError(mensaje(e)) }
  }
  const conectado = useTiempoReal(actualizar)
  function comenzar(agregar: boolean) {
    if (!agregar && recuperable && !window.confirm('Hay un borrador recuperable. ¿Quieres reemplazarlo por un pedido nuevo?')) return
    setAgregando(agregar); setError(''); setAviso(''); setAnulando(null)
    setBuscarProducto(''); setFiltro(''); setCobro(null)
    if (!agregar) setSeleccionado(null)
    setBorrador({ id: agregar ? seleccionado!.id : crypto.randomUUID(), tipo_venta_id: String((tipos.find(t => t.codigo === 'LLEVAR') ?? tipos.find(t => t.codigo === 'PARA_LLEVAR') ?? tipos[0])?.id ?? ''), mesa_referencia: '', cliente_nombre: '', lineas: [] })
  }
  function cambiarLinea(id: string, cambios: Partial<BorradorLinea>) {
    setBorrador((b) => b ? { ...b, lineas: b.lineas.map((l) => l.id === id ? { ...l, ...cambios } : l) } : null)
  }
  async function guardar(cobrarDespues = false) {
    if (!borrador) return
    if (!borrador.lineas.length) { setError('Agrega al menos un producto.'); return }
    if (!agregando && borrador.cliente_telefono?.trim() && !borrador.cliente_nombre.trim()) { setError('Escribe el nombre del cliente para registrar su teléfono.'); return }
    if (borrador.lineas.some((l) => !Number.isSafeInteger(Number(l.cantidad)) || Number(l.cantidad) < 1 || Number(l.cantidad) > 999999)) {
      setError('La cantidad de cada producto debe ser un número entero de 1 a 999999 unidades.')
      return
    }
    setGuardando(true); setError(''); setAviso('')
    try {
      const p = await api<Pedido>(agregando ? `/pedidos/${borrador.id}/lineas` : '/pedidos', {
        method: 'POST', body: JSON.stringify(agregando ? { lineas: borrador.lineas } : { ...borrador, mesa_referencia: '', cliente_nombre: borrador.cliente_nombre.trim() || 'Cliente de mostrador', tipo_venta_id: Number(borrador.tipo_venta_id) }),
      })
      if (!agregando) { localStorage.removeItem(claveBorrador); setRecuperable(null) }
      setSeleccionado(p); setBorrador(null)
      setPedidos((lista) => [p, ...lista.filter((actual) => actual.id !== p.id)])
      setAviso(`Pedido ${p.folio} guardado.`)
      if (cobrarDespues && puedeCobrar) setCobro({ id: p.id })
    } catch (e) {
      // Tarea 18: sin internet el pedido queda en la cola del equipo con folio provisional.
      if (e instanceof ErrorApi && e.status === 0) await guardarSinInternet(cobrarDespues)
      else setError(mensaje(e))
    }
    finally { setGuardando(false) }
  }
  async function guardarSinInternet(cobrarDespues: boolean) {
    if (!borrador || !centro || !usuario) return
    const equipo = await dispositivoActual(centro.id)
    if (!equipo) { setError('Sin internet. Para vender sin conexión, primero elige en Inicio qué equipo es este (por ejemplo CAJA1).'); return }
    const ahora = new Date().toISOString()
    const folio = agregando ? (seleccionado?.folio_offline ?? null) : await siguienteFolioProvisional(equipo.codigo)
    const total = totalLineas(borrador.lineas.map((l) => ({ cantidad: l.cantidad, precio: productos.find((p) => p.id === l.producto_id)?.precio ?? '0' })))
    await encolar({ id: crypto.randomUUID(), centro_id: centro.id, usuario_id: usuario.id, tipo: 'PEDIDO', datos: {
      id: borrador.id, tipo_venta_id: Number(borrador.tipo_venta_id) || seleccionado?.tipo_venta_id, cliente_nombre: borrador.cliente_nombre.trim() || seleccionado?.cliente_nombre || 'Cliente de mostrador',
      creado_en: ahora, folio_offline: folio, total,
      lineas: borrador.lineas.map((l) => ({ id: l.id, producto_id: l.producto_id, cantidad: l.cantidad, notas: l.notas, agregado_en: ahora })),
    } })
    const nuevaVenta = { id: borrador.id, folio, total, lineas: borrador.lineas.map(l => ({ nombre: productos.find(p => p.id === l.producto_id)?.nombre ?? 'Producto', cantidad: l.cantidad, notas: l.notas, importe: totalLineas([{ cantidad: l.cantidad, precio: productos.find(p => p.id === l.producto_id)?.precio ?? '0' }]) })), tipo: tipos.find(t => String(t.id) === borrador.tipo_venta_id)?.nombre ?? '', cliente: borrador.cliente_nombre.trim() || 'Cliente de mostrador', hora: ahora }
    if (!agregando) { localStorage.removeItem(claveBorrador); setRecuperable(null) }
    setBorrador(null); setSeleccionado(null)
    setUltimaSinInternet(nuevaVenta)
    setAviso(agregando ? 'Sin internet: los productos se guardaron en este equipo y se enviarán solos al volver la conexión.' : `Sin internet: pedido guardado en este equipo con folio provisional ${folio}. Se enviará solo al volver la conexión.`)
    if (cobrarDespues && puedeCobrar && !agregando) setVentaLocal({ id: borrador.id, folio, total })
  }
  async function anular() {
    if (!seleccionado || !anulando) return
    setGuardando(true); setError(''); setAviso('')
    try {
      const ruta = anulando === 'PEDIDO' ? `/pedidos/${seleccionado.id}/anulacion` : `/pedidos/${seleccionado.id}/lineas/${anulando}/anulacion`
      const p = await api<Pedido>(ruta, { method: 'POST', body: JSON.stringify({ motivo }) })
      setSeleccionado(p); setPedidos((lista) => lista.map((actual) => actual.id === p.id ? p : actual)); setAnulando(null); setMotivo('')
      setAviso(anulando === 'PEDIDO' ? 'Pedido anulado con su motivo.' : 'Producto anulado con su motivo.')
    } catch (e) { setError(mensaje(e)) }
    finally { setGuardando(false) }
  }
  const categorias = [...new Map(productos.map((p) => [p.categoria.id, p.categoria])).values()]
  const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
  const coincideProducto = (p:Producto) => (!filtro || p.categoria.id===Number(filtro)) && normalizar(`${p.nombre} ${p.sku}`).includes(normalizar(buscarProducto))
  const corresponde = (p: Pedido, filtro: string) => filtro === 'TODOS' || filtro === 'PENDIENTES' && !['PAGADO','ANULADO'].includes(p.estado) || filtro === p.estado || filtro === p.estado_cocina
  const visible = pedidos.filter((p) => corresponde(p, filtroPedido) && `${p.folio} ${p.folio_offline ?? ''} ${p.mesa_referencia ?? ''} ${p.cliente_nombre ?? ''} ${p.cliente_telefono ?? ''}`.toLocaleLowerCase('es').includes(buscar.toLocaleLowerCase('es')))
  const editable = seleccionado && !['PAGADO', 'ANULADO'].includes(seleccionado.estado)
  const esDomicilio = !!borrador && tipos.find(t => String(t.id) === borrador.tipo_venta_id)?.codigo === 'DOMICILIO'
  const unidades = borrador?.lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0) ?? 0
  const totalBorrador = totalLineas((borrador?.lineas ?? []).map((l) => ({ cantidad: l.cantidad, precio: productos.find((p) => p.id === l.producto_id)?.precio ?? '0' })))
  // Tocar un producto que ya está en el pedido (sin notas) suma una unidad en vez de crear otra línea.
  function agregarProducto(productoId: number) {
    const nuevaId = crypto.randomUUID()
    setReciente(borrador?.lineas.find(l => l.producto_id === productoId && !l.notas.trim())?.id ?? nuevaId)
    setBorrador(b => {
      if (!b) return b
      const existente = b.lineas.find(l => l.producto_id === productoId && !l.notas.trim())
      if (existente) return { ...b, lineas: b.lineas.map(l => l.id === existente.id ? { ...l, cantidad: String(Math.min(999999, (Number(l.cantidad) || 0) + 1)) } : l) }
      return { ...b, lineas: [...b.lineas, { id: nuevaId, producto_id: productoId, cantidad: '1', notas: '' }] }
    })
  }
  // El pedido de la derecha se mueve solo hasta el producto recién tocado.
  useEffect(() => {
    const caja = listaTicket.current, linea = reciente ? document.getElementById(`linea-${reciente}`) : null
    if (caja && linea && caja.scrollHeight > caja.clientHeight) caja.scrollTop = Math.max(0, linea.offsetTop - caja.offsetTop - caja.clientHeight / 2)
  }, [reciente, unidades])

  return <div className={`ventas-mostrador mx-auto space-y-4 ${borrador ? '' : 'max-w-7xl'}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-teal-800">Mostrador · {centro?.nombre}</p><h1 className={borrador ? 'text-2xl font-bold' : 'text-3xl font-bold'}>Ventas</h1>{!borrador && <p className="text-slate-600">Toca «Nuevo pedido» para empezar una venta.</p>}</div><div className="flex flex-wrap gap-2"><button className={boton} disabled={guardando || cobroBloqueado || cargando || !!borrador || !tipos.length} onClick={() => comenzar(false)}>Nuevo pedido</button>{puedeCobrar && <button className={secundario} disabled={guardando || cobroBloqueado || !!borrador} onClick={() => { setCobro({}); setSeleccionado(null); setAviso('') }}>Pendientes y comprobantes</button>}<button className={secundario} disabled={guardando || cobroBloqueado} onClick={() => void actualizar()}>Actualizar</button></div></div>
    {!(borrador && conectado) && <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${conectado ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${conectado ? 'bg-teal-600' : 'bg-amber-500'}`} />{conectado ? 'Conectado con Cocina y Caja' : 'Reconectando con Cocina… toca Actualizar si no ves cambios'}</p>}
    {error && !cobro && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {aviso && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{aviso}</p>}
    {ultimaSinInternet && !borrador && <section aria-label="Imprimir venta sin internet" className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"><p className="grow"><strong>{ultimaSinInternet.folio ?? "Productos agregados"}</strong> · imprime la comanda para cocina (sin internet la pantalla de Cocina no la recibe).</p><BotonImprimir modo="comanda" datos={comandaDe(ultimaSinInternet)} />{ultimaSinInternet.pago && <BotonImprimir modo="comprobante" datos={comandaDe(ultimaSinInternet)} />}<button type="button" className={secundario} onClick={() => setUltimaSinInternet(null)}>Listo</button></section>}
    {ventaLocal && <CobroSinInternet venta={ventaLocal} alTerminar={r => { setUltimaSinInternet(u => u && u.id === ventaLocal.id ? { ...u, pago: r } : u); setAviso(`Cobro guardado sin internet para ${ventaLocal.folio}.${r.vuelto ? ` Vuelto: ${dinero(r.vuelto)}.` : ""} Se enviará solo al volver la conexión.`); setVentaLocal(null) }} />}
    {!borrador && !cobro && recuperable && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p>Hay un borrador local sin enviar a Cocina.</p><button className={secundario} onClick={() => { setBorrador(recuperable); setAgregando(false); setSeleccionado(null); setAviso('Borrador recuperado. Revisa disponibilidad y precios antes de guardar.') }}>Recuperar borrador</button></div>}
    {borrador && <form aria-label={agregando ? 'Agregar productos' : 'Nuevo pedido'} className="terminal-venta" onSubmit={(e) => { e.preventDefault(); void guardar((e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'cobrar') }}>
      <section className="terminal-menu" aria-label="Menú de productos">
        <label className="terminal-buscar font-semibold"><span className="sr-only">Buscar producto</span><Search aria-hidden className="terminal-buscar-icono" /><input type="search" className={campo} value={buscarProducto} onChange={(e) => { setBuscarProducto(e.target.value); setFiltro('') }} placeholder="Buscar producto por nombre o código" /></label>
        <div aria-label="Categorías" className="terminal-categorias"><button type="button" className={filtro === '' ? 'categoria-activa' : ''} aria-pressed={filtro === ''} onClick={() => { setFiltro(''); setBuscarProducto('') }}>Todos <span>{productos.length}</span></button>{categorias.map(c => <button type="button" key={c.id} className={filtro === String(c.id) ? 'categoria-activa' : ''} aria-pressed={filtro === String(c.id)} onClick={() => { setFiltro(String(c.id)); setBuscarProducto('') }}>{c.nombre} <span>{productos.filter(p => p.categoria.id === c.id).length}</span></button>)}</div>
        <div className="terminal-productos">
          <div className="rejilla-productos">{productos.filter(coincideProducto).map((p) => { const enPedido = borrador.lineas.filter(l => l.producto_id === p.id).reduce((s, l) => s + (Number(l.cantidad) || 0), 0); return <button type="button" className={`producto-menu ${enPedido ? 'producto-en-pedido' : ''}`} disabled={guardando} key={p.id} aria-label={`Agregar ${p.nombre} por ${dinero(p.precio)}`} onClick={() => agregarProducto(p.id)}>{enPedido > 0 && <span aria-hidden className="producto-cuenta">{enPedido}</span>}{p.foto_datos ? <img src={p.foto_datos} alt="" loading="lazy" /> : <span aria-hidden className="producto-sin-foto"><ImageOff className="h-6 w-6" /></span>}<span className="producto-nombre">{p.nombre}</span><span className="producto-precio">{dinero(p.precio)}</span></button> })}</div>
          {!!productos.length && !productos.some(coincideProducto) && <p className="p-4 text-slate-600">No hay productos con esos filtros.</p>}
          {!productos.length && <p className="p-4 text-slate-600">No hay productos disponibles en este centro.</p>}
        </div>
      </section>
      <aside id="resumen-pedido" className="terminal-ticket" aria-label="Pedido en curso">
        <div className="flex items-baseline justify-between gap-2"><h2 className="text-xl font-bold">{agregando ? `Agregar al pedido ${seleccionado?.folio}` : 'Nuevo pedido'}</h2></div>
        <div className="ticket-cuerpo" ref={listaTicket}>
          {!agregando && <div role="radiogroup" aria-label="Tipo de venta" className="tipos-venta">{tipos.map((t) => { const info = infoTipo(t); const activo = borrador.tipo_venta_id === String(t.id); return <label key={t.id} title={info.ayuda} className={`tipo-venta ${activo ? 'tipo-venta-activo' : ''}`}><input type="radio" name="tipo_venta" className="sr-only" value={t.id} checked={activo} disabled={guardando} onChange={() => setBorrador({ ...borrador, tipo_venta_id: String(t.id) })} /><info.icono aria-hidden className="h-5 w-5" /><span>{info.nombre}</span></label> })}</div>}
          {!agregando && <details className="datos-cliente" open={esDomicilio || undefined}><summary><span aria-hidden className="cliente-icono"><User className="h-5 w-5" /></span><span className="grow"><strong className="block text-base leading-tight">{borrador.cliente_nombre.trim() || 'Cliente de mostrador'}</strong><span className="block text-sm font-normal text-slate-600">{[borrador.cliente_telefono?.trim() && `Tel. ${borrador.cliente_telefono.trim()}`, borrador.cliente_direccion?.trim() && borrador.cliente_direccion.trim()].filter(Boolean).join(' · ') || (esDomicilio ? 'Falta teléfono y dirección' : 'Agregar nombre, teléfono o dirección')}</span></span><span aria-hidden className="cliente-editar">Cambiar</span></summary><div className="panel-cliente"><div className="flex items-center justify-between gap-2"><h3 className="text-xl font-bold">Datos del cliente</h3><button type="button" className={boton} onClick={e => { e.currentTarget.closest('details')!.open = false }}>Listo</button></div>{esDomicilio && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Para domicilio hacen falta el teléfono y la dirección.</p>}
            <label>Nombre del cliente (opcional)<input placeholder="Cliente de mostrador" maxLength={100} disabled={guardando} className={campo} value={borrador.cliente_nombre} onChange={(e) => setBorrador({ ...borrador, cliente_nombre: e.target.value })} /></label>
            <label>Teléfono del cliente<input type="tel" maxLength={30} disabled={guardando} className={campo} value={borrador.cliente_telefono ?? ''} onChange={e => setBorrador({ ...borrador, cliente_telefono: e.target.value, actualizar_cliente: false })} /></label>{permisoClientes(usuario,'clientes') && <button type="button" className={`${secundario} w-full`} disabled={guardando} onClick={() => setBuscandoCliente(true)}><Search aria-hidden className="mr-2 inline h-4 w-4" />Buscar cliente</button>}
            <label>Dirección del cliente<textarea rows={3} maxLength={300} disabled={guardando} className={campo} value={borrador.cliente_direccion ?? ''} onChange={e => setBorrador({ ...borrador, cliente_direccion: e.target.value, actualizar_cliente: false })} /></label>
            {borrador.cliente_id ? <div className="space-y-2"><p>Cliente seleccionado. El pedido conservará una copia de estos datos.</p>{permisoClientes(usuario,'clientes','editar') && <label className="flex gap-2"><input type="checkbox" disabled={guardando} checked={borrador.actualizar_cliente ?? false} onChange={e => setBorrador({ ...borrador, actualizar_cliente: e.target.checked })} />Confirmo actualizar la ficha del cliente con los datos de esta venta</label>}<button type="button" className={secundario} disabled={guardando} onClick={() => setBorrador({ ...borrador, cliente_id: null, cliente_version: null, actualizar_cliente: false })}>Quitar vínculo con cliente</button></div> : <p className="text-sm text-slate-600">Si escribes nombre y teléfono, el cliente queda guardado para la próxima vez. Si ya compró antes, toca «Buscar cliente».</p>}
          </div></details>}
          {!borrador.lineas.length && <p className="ticket-vacio"><ShoppingCart aria-hidden className="mx-auto mb-3 h-8 w-8" strokeWidth={1.5} /><strong>El pedido está vacío</strong><br />Toca un producto del menú para agregarlo.</p>}
          <ul className="ticket-lineas">{borrador.lineas.map((l, indice) => { const producto = productos.find((p) => p.id === l.producto_id); return <li id={`linea-${l.id}`} className={`linea-ticket ${reciente === l.id ? 'linea-reciente' : ''}`} key={l.id}>
            <div className="flex items-start justify-between gap-2"><span><strong className="block leading-tight">{producto?.nombre}</strong><span className="text-xs text-slate-500">{dinero(producto?.precio ?? 0)} c/u</span></span><strong className="whitespace-nowrap text-lg">Q {totalLineas([{ cantidad: l.cantidad, precio: producto?.precio ?? '0' }])}</strong></div>
            <div className="cantidad-venta"><button type="button" aria-label={`Disminuir cantidad ${indice+1}`} className="boton-cantidad" disabled={guardando || Number(l.cantidad)<=1} onClick={() => cambiarLinea(l.id,{cantidad:String(Math.max(1,Number(l.cantidad)-1))})}><Minus aria-hidden className="h-4 w-4" /></button><input aria-label={`Cantidad ${indice + 1}`} required type="number" min="1" max="999999" step="1" value={l.cantidad} disabled={guardando} onChange={(e) => cambiarLinea(l.id, { cantidad: e.target.value })} /><button type="button" aria-label={`Aumentar cantidad ${indice+1}`} className="boton-cantidad" disabled={guardando || Number(l.cantidad)>=999999} onClick={() => cambiarLinea(l.id,{cantidad:String(Math.min(999999,Number(l.cantidad)+1))})}><Plus aria-hidden className="h-4 w-4" /></button><button type="button" className="boton-quitar" disabled={guardando} aria-label={`Quitar línea ${indice + 1}`} onClick={() => setBorrador({ ...borrador, lineas: borrador.lineas.filter((actual) => actual.id !== l.id) })}><Trash2 aria-hidden className="h-4 w-4" /></button></div>
            <details className="nota-linea"><summary><StickyNote aria-hidden className="h-4 w-4" />{l.notas.trim() ? <em>{l.notas}</em> : 'Agregar nota para cocina'}</summary><div className="mt-2 space-y-2"><div className="flex flex-wrap gap-1.5" role="group" aria-label={`Notas rápidas ${indice + 1}`}>{notasFrecuentes.map(n => { const puesta = l.notas.split('; ').includes(n); return <button type="button" key={n} aria-pressed={puesta} aria-label={`Nota ${n} ${indice + 1}`} disabled={guardando} className={`nota-rapida ${puesta ? 'nota-rapida-puesta' : ''}`} onClick={() => cambiarLinea(l.id, { notas: alternarNota(l.notas, n) })}>{puesta ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Plus aria-hidden className="h-3.5 w-3.5" />}{n}</button> })}</div><label className="block text-sm text-slate-600">Notas {indice + 1}<input className={campo} maxLength={200} placeholder="Otra indicación (opcional)" value={l.notas} disabled={guardando} onChange={(e) => cambiarLinea(l.id, { notas: e.target.value })} /></label></div></details>
          </li> })}</ul>
        </div>
        <div className="ticket-pie">
          <p className="total-venta"><span className="total-unidades">{unidades} {unidades === 1 ? 'producto' : 'productos'}</span>Total: Q {totalBorrador}</p>
          {puedeCobrar && <button className={`${boton} min-h-14 w-full text-lg`} type="submit" value="cobrar" disabled={guardando || !borrador.lineas.length}>{guardando ? 'Guardando…' : 'Guardar y cobrar'}</button>}
          <div className="grid grid-cols-2 gap-2"><button className={puedeCobrar ? secundario : `${boton} min-h-14 text-lg`} disabled={guardando} title="Lo manda a Cocina para cobrarlo después">Guardar pedido</button><button type="button" className="min-h-12 rounded-xl px-4 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50" disabled={guardando} onClick={() => { if (borrador.lineas.length && !window.confirm('¿Descartar los productos sin guardar?')) return; if (!agregando) { localStorage.removeItem(claveBorrador); setRecuperable(null) } setBorrador(null) }}>Cancelar</button></div>
        </div>
      </aside>
      {borrador.lineas.length > 0 && <a href="#resumen-pedido" className="barra-pedido-movil"><span className="inline-flex items-center gap-2"><ShoppingCart aria-hidden className="h-5 w-5" />{unidades} {unidades === 1 ? 'producto' : 'productos'}</span><strong>Ver pedido · Q {totalBorrador}</strong></a>}
    </form>}
    {seleccionado && !borrador && !cobro && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-bold">Pedido {seleccionado.folio}</h2><p>{seleccionado.tipo_venta.nombre} · {seleccionado.mesa_referencia || seleccionado.cliente_nombre} · {estados[seleccionado.estado]}</p><p>{seleccionado.cliente_telefono && `Teléfono: ${seleccionado.cliente_telefono}`}</p><p>{seleccionado.cliente_direccion && `Dirección: ${seleccionado.cliente_direccion}`}</p><p>Tomado por {seleccionado.usuario.nombre} a las {hora(seleccionado.creado_en)}</p>{seleccionado.folio_offline && <p>Folio provisional: {seleccionado.folio_offline}</p>}<div className="mt-2"><BotonImprimir modo="comanda" datos={{ folio: String(seleccionado.folio), provisional: false, tipo: seleccionado.tipo_venta.nombre, cliente: seleccionado.cliente_nombre ?? "Cliente de mostrador", hora: seleccionado.creado_en, lineas: seleccionado.pedido_detalle.filter(l => l.estado === "ACTIVA").map(l => ({ nombre: l.producto.nombre, cantidad: l.cantidad, notas: l.notas })), centro: centro?.nombre }} /></div></div>{editable && <button className={boton} disabled={guardando} onClick={() => comenzar(true)}>Agregar productos</button>}</div>
      <ul className="space-y-3">{seleccionado.pedido_detalle.map((l) => <li className="rounded-xl bg-slate-50 p-3" key={l.id}>
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{l.cantidad} × {l.producto.nombre} · {dinero(l.importe)}</strong>{l.estado === 'ACTIVA' && editable && esGerente && <button className={secundario} disabled={guardando} aria-label={`Anular ${l.producto.nombre}`} onClick={() => { setAnulando(l.id); setMotivo('') }}>Quitar producto</button>}</div>
        {l.estado === 'ACTIVA' && editable && !esGerente && <AccionControl tipo="ANULAR_LINEA" pedidoId={seleccionado.id} referencia={l.id} etiqueta={`Pedir quitar ${l.producto.nombre}`} alGuardar={actualizar} />}
        {l.notas && <p>Notas: {l.notas}</p>}<p className="text-sm text-slate-600">Agregado por {l.usuario_pedido_detalle_agregado_porTousuario.nombre} a las {hora(l.agregado_en)}</p>{l.estado === 'ANULADA' && <p className="text-red-700">Anulado: {l.motivo_anulacion}</p>}
      </li>)}</ul>
      {anulando && <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void anular() }}><label>Motivo de la anulación<input className={campo} required maxLength={200} disabled={guardando} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label><button className={boton} disabled={guardando}>Confirmar anulación</button><button type="button" className={secundario} disabled={guardando} onClick={() => setAnulando(null)}>Cancelar anulación</button></form>}
      {seleccionado.estado_cocina && <p className="font-semibold text-teal-800">Cocina: {nombresCocina[seleccionado.estado_cocina]}</p>}
      <p className="text-xl font-bold">Total: {dinero(seleccionado.total)} · Pagado: {dinero(seleccionado.pagado)} · Saldo: {dinero(seleccionado.saldo)}</p>
      <div className="flex flex-wrap gap-3">{puedeEliminar && <button className={secundario} disabled={guardando || !!anulando} onClick={() => setEliminarPedido(seleccionado)}>Eliminar pedido</button>}{puedeCobrar && <button className={boton} disabled={guardando || !!anulando} onClick={() => setCobro({ id: seleccionado.id })}>{editable ? 'Cobrar este pedido' : 'Ver comprobante'}</button>}{editable && esGerente && <button className="min-h-12 rounded-xl border border-red-200 bg-red-50 px-4 font-semibold text-red-800 disabled:opacity-50" disabled={guardando || !!anulando || Number(seleccionado.pagado) > 0} onClick={() => { setAnulando('PEDIDO'); setMotivo('') }}>Anular pedido</button>}</div>
      {editable && esGerente && Number(seleccionado.pagado) > 0 && <p>Primero deben anularse los pagos antes de cancelar el pedido.</p>}
      {editable && !esGerente && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Para quitar un producto toca «Pedir quitar…» y escribe el motivo: un gerente lo autoriza. Para anular el pedido completo, pide a un gerente que lo haga desde su usuario.</p>}
    </section>}
    {cobro && puedeCobrar && <section className="space-y-4" aria-label="Cobro en mostrador">
      {puedeTomarPedidos && <button className={secundario} disabled={cobroBloqueado} onClick={() => { setCobro(null); void actualizar() }}>{cobro.id ? 'Volver al pedido' : 'Ver pedidos guardados'}</button>}
      <Caja key={cobro.id ?? 'pendientes'} pedidoId={cobro.id} integrado alBloquear={setCobroBloqueado} alTerminar={puedeTomarPedidos ? () => comenzar(false) : undefined} alCambiarPedido={p => {
        setPedidos(lista => lista.map(actual => actual.id === p.id ? { ...actual, estado: p.estado, total: p.total, pagado: p.pagado, saldo: p.saldo } : actual))
        setSeleccionado(actual => actual?.id === p.id ? { ...actual, estado: p.estado, total: p.total, pagado: p.pagado, saldo: p.saldo } : actual)
      }} />
    </section>}
    {!borrador && !cobro && <section className="space-y-4" aria-label="Pedidos guardados"><ColaEnEquipo alCobrar={puedeCobrar ? v => { setVentaLocal(v); setAviso("") } : undefined} /><h2 className="text-xl font-bold">Pedidos guardados</h2>
    <div className="flex flex-wrap gap-2">{[['TODOS','Todos'],['PENDIENTES','Pendientes de cobro'],['PAGADO','Pagados'],['ANULADO','Anulados']].map(([codigo,nombre]) => <button type="button" key={codigo} className={filtroPedido === codigo ? boton : secundario} aria-pressed={filtroPedido === codigo} onClick={() => setFiltroPedido(codigo)}>{nombre} ({pedidos.filter(p => corresponde(p,codigo)).length})</button>)}</div>
    <label className="block">Fecha de pedidos<input type="date" className={campo} value={fechaPedidos} onChange={e => { setFechaPedidos(e.target.value); setVerAnteriores(false); setSeleccionado(null) }} /></label><label className="inline-flex min-h-12 items-center gap-2"><input type="checkbox" disabled={!!fechaPedidos} checked={verAnteriores} onChange={e => setVerAnteriores(e.target.checked)} />Incluir abiertos de días anteriores</label>
    <label className="block">Buscar por folio, mesa, cliente o teléfono<input className={campo} value={buscar} onChange={(e) => setBuscar(e.target.value)} /></label>
    {cargando ? <p>Cargando pedidos…</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((p) => <button disabled={guardando || !!borrador} className="min-h-32 rounded-2xl border border-slate-200 bg-white p-4 text-left disabled:opacity-50" key={p.id} onClick={() => { setSeleccionado(p); setAnulando(null); setError('') }} aria-label={`Ver pedido ${p.folio}`}><span className="block text-2xl font-bold">Pedido {p.folio} · {dinero(p.total)}</span>{p.folio_offline && <span className="block text-sm text-slate-600">Provisional {p.folio_offline}</span>}<span className={`my-1 inline-block rounded-lg px-2 py-1 text-sm font-bold ${p.estado === 'PAGADO' ? 'bg-emerald-100 text-emerald-800' : p.estado === 'ANULADO' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>{p.estado === 'PAGADO' ? 'Pagado' : p.estado === 'ANULADO' ? 'Anulado' : `Falta cobrar ${dinero(p.saldo)}`}</span><span className="block">{p.fecha_operacion && `${p.fecha_operacion.split('-').reverse().join('/')} · `}{estados[p.estado]} · {hora(p.creado_en)}</span><span className="block">{p.mesa_referencia || p.cliente_nombre}</span>{p.estado_cocina && <span className="mt-2 inline-block rounded-lg bg-teal-50 px-2 py-1 font-semibold text-teal-800">Cocina: {nombresCocina[p.estado_cocina]}</span>}</button>)}</div>}
    {!cargando && !visible.length && <p>No hay pedidos con esos filtros para la fecha elegida.</p>}
    </section>}
    {buscandoCliente && borrador && <BuscarCliente inicial={borrador.cliente_telefono ?? ''} cerrar={() => setBuscandoCliente(false)} elegir={c => { setBorrador({ ...borrador, cliente_id: c.id, cliente_version: c.version, cliente_nombre: c.nombre, cliente_telefono: c.telefono, cliente_direccion: c.direccion ?? '', actualizar_cliente: false }); setBuscandoCliente(false) }} />}
    {eliminarPedido && <MovimientoPapelera tipo="pedidos" registro={{ id: eliminarPedido.id, version: eliminarPedido.version, nombre: `Pedido ${eliminarPedido.folio} · ${eliminarPedido.fecha_operacion ?? ''}` }} cerrar={() => setEliminarPedido(null)} terminar={() => { setEliminarPedido(null); setSeleccionado(null); setAviso('Pedido enviado a la papelera.'); void actualizar() }} />}
  </div>
}
