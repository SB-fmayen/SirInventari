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
}
interface BorradorLinea { id: string; producto_id: number; cantidad: string; notas: string }
interface Borrador { id: string; tipo_venta_id: string; mesa_referencia: string; cliente_nombre: string; cliente_telefono?: string; cliente_direccion?: string; cliente_id?: string | null; cliente_version?: number | null; actualizar_cliente?: boolean; lineas: BorradorLinea[] }
const boton = 'min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50'
const secundario = 'min-h-12 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 disabled:opacity-50'
const campo = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base'
const dinero = (valor: string | number) => `Q ${Number(valor).toFixed(2)}`
const hora = (valor: string) => new Date(valor).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit' })
const estados: Record<string, string> = { ABIERTO: 'Abierto', EN_PREPARACION: 'En preparación', LISTO: 'Listo', ENTREGADO: 'Entregado', PAGADO: 'Pagado', ANULADO: 'Anulado' }
const tiposConocidos: Record<string, { icono: string; nombre: string; ayuda: string }> = {
  MESA: { icono: '🍽️', nombre: 'Comer en mesa', ayuda: 'Se queda a comer aquí' },
  LLEVAR: { icono: '🛍️', nombre: 'Para llevar', ayuda: 'Se lo lleva en bolsa' },
  PARA_LLEVAR: { icono: '🛍️', nombre: 'Para llevar', ayuda: 'Se lo lleva en bolsa' },
  DOMICILIO: { icono: '🛵', nombre: 'A domicilio', ayuda: 'Pide teléfono y dirección' },
  APP: { icono: '📱', nombre: 'App de entregas', ayuda: 'Pedido de una app' },
}
const infoTipo = (t: TipoVenta) => tiposConocidos[t.codigo] ?? { icono: '🧾', nombre: t.nombre, ayuda: '' }
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
  useCambiosSinGuardar(!!borrador || !!anulando)
  useEffect(() => {
    if (borrador && !agregando) {
      try { localStorage.setItem(claveBorrador, JSON.stringify(borrador)) } catch { queueMicrotask(()=>setAviso('No se pudo conservar el borrador en este dispositivo. No salgas antes de guardar.')) }
    }
  }, [borrador, agregando, claveBorrador])
  const cargar = useCallback(async () => {
    if (!puedeTomarPedidos) return { ps: [], menu: [], ts: [] }
    const [ps, menu, ts] = await Promise.all([api<Pedido[]>(fechaPedidos ? `/pedidos?fecha=${fechaPedidos}` : verAnteriores ? '/pedidos?anteriores=1' : '/pedidos'), api<Producto[]>('/pedidos/catalogo'), api<TipoVenta[]>('/pedidos/tipos')])
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
    } catch (e) { setError(mensaje(e)) }
    finally { setGuardando(false) }
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
  const visible = pedidos.filter((p) => corresponde(p, filtroPedido) && `${p.folio} ${p.mesa_referencia ?? ''} ${p.cliente_nombre ?? ''} ${p.cliente_telefono ?? ''}`.toLocaleLowerCase('es').includes(buscar.toLocaleLowerCase('es')))
  const editable = seleccionado && !['PAGADO', 'ANULADO'].includes(seleccionado.estado)
  const esDomicilio = !!borrador && tipos.find(t => String(t.id) === borrador.tipo_venta_id)?.codigo === 'DOMICILIO'
  const unidades = borrador?.lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0) ?? 0
  const nombreCorto = (p: Producto) => p.nombre
  // Tocar un producto que ya está en el pedido (sin notas) suma una unidad en vez de crear otra línea.
  function agregarProducto(productoId: number) {
    setBorrador(b => {
      if (!b) return b
      const existente = b.lineas.find(l => l.producto_id === productoId && !l.notas.trim())
      if (existente) return { ...b, lineas: b.lineas.map(l => l.id === existente.id ? { ...l, cantidad: String(Math.min(999999, (Number(l.cantidad) || 0) + 1)) } : l) }
      return { ...b, lineas: [...b.lineas, { id: crypto.randomUUID(), producto_id: productoId, cantidad: '1', notas: '' }] }
    })
  }

  return <div className="ventas-mostrador mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-teal-800">Mostrador · {centro?.nombre}</p><h1 className="text-3xl font-bold">Ventas</h1><p className="text-slate-600">{borrador ? 'Toca los productos que pide el cliente. A la derecha ves cómo va el pedido.' : 'Toca «Nuevo pedido» para empezar una venta.'}</p></div><div className="flex flex-wrap gap-2"><button className={boton} disabled={guardando || cobroBloqueado || cargando || !!borrador || !tipos.length} onClick={() => comenzar(false)}>Nuevo pedido</button>{puedeCobrar && <button className={secundario} disabled={guardando || cobroBloqueado || !!borrador} onClick={() => { setCobro({}); setSeleccionado(null); setAviso('') }}>Pendientes y comprobantes</button>}<button className={secundario} disabled={guardando || cobroBloqueado} onClick={() => void actualizar()}>Actualizar</button></div></div>
    <ol aria-label="Pasos de la venta" className="pasos-venta"><li aria-current={borrador ? 'step' : undefined}>1. Elegir productos</li><li aria-current={seleccionado && !borrador && !cobro ? 'step' : undefined}>2. Revisar pedido</li><li aria-current={cobro ? 'step' : undefined}>3. Cobrar y entregar</li></ol>
    <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${conectado ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${conectado ? 'bg-teal-600' : 'bg-amber-500'}`} />{conectado ? 'Conectado con Cocina y Caja' : 'Reconectando con Cocina… toca Actualizar si no ves cambios'}</p>
    {error && !cobro && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {aviso && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{aviso}</p>}
    {!borrador && !cobro && recuperable && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p>Hay un borrador local sin enviar a Cocina.</p><button className={secundario} onClick={() => { setBorrador(recuperable); setAgregando(false); setSeleccionado(null); setAviso('Borrador recuperado. Revisa disponibilidad y precios antes de guardar.') }}>Recuperar borrador</button></div>}
    {borrador && <form aria-label={agregando ? 'Agregar productos' : 'Nuevo pedido'} className="space-y-4 rounded-2xl border border-teal-200 bg-white p-5" onSubmit={(e) => { e.preventDefault(); void guardar((e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'cobrar') }}>
      <h2 className="text-2xl font-bold">{agregando ? `Agregar al pedido ${seleccionado?.folio}` : 'Nuevo pedido'}</h2>
      {!agregando && <fieldset className="space-y-2"><legend className="mb-2 text-lg font-bold">1 · ¿Cómo se lleva el pedido?</legend><div role="radiogroup" aria-label="Tipo de venta" className="tipos-venta">{tipos.map((t) => { const info = infoTipo(t); const activo = borrador.tipo_venta_id === String(t.id); return <label key={t.id} className={`tipo-venta ${activo ? 'tipo-venta-activo' : ''}`}><input type="radio" name="tipo_venta" className="sr-only" value={t.id} checked={activo} disabled={guardando} onChange={() => setBorrador({ ...borrador, tipo_venta_id: String(t.id) })} /><span aria-hidden className="text-3xl">{info.icono}</span><span className="font-bold">{info.nombre}</span><span className="text-xs text-slate-600">{info.ayuda}</span></label> })}</div></fieldset>}
      {!agregando && <details className="datos-cliente rounded-xl border border-slate-200 bg-slate-50 p-3" open={esDomicilio || !!borrador.cliente_nombre || !!borrador.cliente_telefono || !!borrador.cliente_id || undefined}><summary className="cursor-pointer text-lg font-bold">2 · Datos del cliente <span className="text-sm font-normal text-slate-600">{esDomicilio ? '(obligatorio para domicilio: teléfono y dirección)' : '(opcional, toca para abrir)'}</span></summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>Nombre del cliente (opcional)<input placeholder="Cliente de mostrador" maxLength={100} disabled={guardando} className={campo} value={borrador.cliente_nombre} onChange={(e) => setBorrador({ ...borrador, cliente_nombre: e.target.value })} /></label>
        <label>Teléfono del cliente<div className="flex gap-2"><input type="tel" maxLength={30} disabled={guardando} className={campo} value={borrador.cliente_telefono ?? ''} onChange={e => setBorrador({ ...borrador, cliente_telefono: e.target.value, actualizar_cliente: false })} />{permisoClientes(usuario,'clientes') && <button type="button" className={secundario} disabled={guardando} onClick={() => setBuscandoCliente(true)}>Buscar cliente</button>}</div></label>
        <label>Dirección del cliente<textarea rows={2} maxLength={300} disabled={guardando} className={campo} value={borrador.cliente_direccion ?? ''} onChange={e => setBorrador({ ...borrador, cliente_direccion: e.target.value, actualizar_cliente: false })} /></label>
        {borrador.cliente_id ? <div className="sm:col-span-2 space-y-2"><p>Cliente seleccionado. El pedido conservará una copia de estos datos.</p>{permisoClientes(usuario,'clientes','editar') && <label className="flex gap-2"><input type="checkbox" disabled={guardando} checked={borrador.actualizar_cliente ?? false} onChange={e => setBorrador({ ...borrador, actualizar_cliente: e.target.checked })} />Confirmo actualizar la ficha del cliente con los datos de esta venta</label>}<button type="button" className={secundario} disabled={guardando} onClick={() => setBorrador({ ...borrador, cliente_id: null, cliente_version: null, actualizar_cliente: false })}>Quitar vínculo con cliente</button></div> : <p className="text-sm sm:col-span-2">Si escribes nombre y teléfono, el cliente queda guardado para la próxima vez. Si ya compró antes, toca «Buscar cliente».</p>}
      </div></details>}
      <div className="toma-pedido"><div className="space-y-4">
      <h3 className="text-lg font-bold">{agregando ? 'Toca los productos que quiere agregar' : '3 · Toca los productos que pide'}</h3>
      <label className="block font-semibold">Buscar producto<input type="search" className={campo} value={buscarProducto} onChange={(e) => { setBuscarProducto(e.target.value); setFiltro('') }} placeholder="Nombre o código del producto" /></label>
      <div aria-label="Categorías" className="categorias-venta"><button type="button" className={filtro === '' ? boton : secundario} aria-pressed={filtro === ''} onClick={() => { setFiltro(''); setBuscarProducto('') }}>Todos</button>{categorias.map(c => <button type="button" key={c.id} className={filtro === String(c.id) ? boton : secundario} aria-pressed={filtro === String(c.id)} onClick={() => { setFiltro(String(c.id)); setBuscarProducto('') }}>{c.nombre} <span className="text-xs opacity-70">{productos.filter(p => p.categoria.id === c.id).length}</span></button>)}</div>
      <p className="text-sm text-slate-600">{productos.filter(coincideProducto).length} productos · Cada toque suma 1 unidad.</p>
      <div className="productos-menu grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{productos.filter(coincideProducto).map((p) => { const enPedido = borrador.lineas.filter(l => l.producto_id === p.id).reduce((s, l) => s + (Number(l.cantidad) || 0), 0); return <button type="button" className={`${secundario} producto-menu relative py-3 text-left ${enPedido ? 'producto-en-pedido' : ''}`} disabled={guardando} key={p.id} aria-label={`Agregar ${p.nombre} por ${dinero(p.precio)}`} onClick={() => agregarProducto(p.id)}>{enPedido > 0 && <span aria-hidden className="absolute right-2 top-2 rounded-full bg-teal-700 px-2.5 py-1 text-sm font-bold text-white shadow">× {enPedido}</span>}{p.foto_datos ? <img src={p.foto_datos} alt="" loading="lazy" className="h-24 w-full rounded-lg object-cover" /> : <span aria-hidden className="flex h-24 w-full items-center justify-center rounded-lg bg-slate-100 text-3xl">🍴</span>}<span className="leading-tight">{nombreCorto(p)}</span><span className="block text-lg font-bold text-teal-800">{dinero(p.precio)} <span aria-hidden className="float-right rounded-full bg-teal-700 px-2 text-white">+</span></span></button> })}</div>
      {!!productos.length && !productos.some(coincideProducto) && <p>No hay productos con esos filtros.</p>}
      {!productos.length && <p>No hay productos disponibles en este centro.</p>}
      </div><div id="resumen-pedido" className="resumen-pedido space-y-4"><h3 className="text-lg font-bold">{agregando ? 'Productos a agregar' : '4 · Revisa el pedido'} <span className="text-sm font-normal text-slate-500">· {unidades} {unidades === 1 ? 'producto' : 'productos'}</span></h3>
      {!borrador.lineas.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-slate-600"><span aria-hidden className="mb-2 block text-4xl">🛒</span>Todavía no hay productos.<br />Toca un producto del menú para agregarlo.</p>}
      <ul className="space-y-3">{borrador.lineas.map((l, indice) => <li className="linea-venta grid gap-3 rounded-xl border border-slate-200 bg-white p-3" key={l.id}><strong className="flex justify-between gap-3 text-base"><span>{productos.find((p) => p.id === l.producto_id)?.nombre}</span><span className="whitespace-nowrap">Q {totalLineas([{ cantidad: l.cantidad, precio: productos.find(p => p.id === l.producto_id)?.precio ?? '0' }])}</span></strong><div className="cantidad-venta"><button type="button" aria-label={`Disminuir cantidad ${indice+1}`} className={`${secundario} boton-cantidad`} disabled={guardando || Number(l.cantidad)<=1} onClick={() => cambiarLinea(l.id,{cantidad:String(Math.max(1,Number(l.cantidad)-1))})}>−</button><input aria-label={`Cantidad ${indice + 1}`} className={`${campo} w-20`} required type="number" min="1" max="999999" step="1" value={l.cantidad} disabled={guardando} onChange={(e) => cambiarLinea(l.id, { cantidad: e.target.value })} /><button type="button" aria-label={`Aumentar cantidad ${indice+1}`} className={`${secundario} boton-cantidad`} disabled={guardando || Number(l.cantidad)>=999999} onClick={() => cambiarLinea(l.id,{cantidad:String(Math.min(999999,Number(l.cantidad)+1))})}>+</button><button type="button" className="ml-auto min-h-12 rounded-xl px-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={guardando} aria-label={`Quitar línea ${indice + 1}`} onClick={() => setBorrador({ ...borrador, lineas: borrador.lineas.filter((actual) => actual.id !== l.id) })}>🗑 Quitar</button></div><div className="space-y-2"><div className="flex flex-wrap gap-2" role="group" aria-label={`Notas rápidas ${indice + 1}`}>{notasFrecuentes.map(n => { const puesta = l.notas.split('; ').includes(n); return <button type="button" key={n} aria-pressed={puesta} aria-label={`Nota ${n} ${indice + 1}`} disabled={guardando} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${puesta ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`} onClick={() => cambiarLinea(l.id, { notas: alternarNota(l.notas, n) })}>{puesta ? '✓ ' : '+ '}{n}</button> })}</div><label className="block text-sm text-slate-600">Notas {indice + 1}<input className={campo} maxLength={200} placeholder="Otra indicación para cocina (opcional)" value={l.notas} disabled={guardando} onChange={(e) => cambiarLinea(l.id, { notas: e.target.value })} /></label></div></li>)}</ul>
      <p className="total-venta">Total de los productos nuevos: Q {totalLineas(borrador.lineas.map((l) => ({ cantidad: l.cantidad, precio: productos.find((p) => p.id === l.producto_id)?.precio ?? '0' })))}</p>
      <div className="grid gap-2">{puedeCobrar && <button className={`${boton} min-h-14 w-full text-lg`} type="submit" value="cobrar" disabled={guardando || !borrador.lineas.length}>{guardando ? 'Guardando…' : 'Guardar y cobrar'}</button>}<button className={puedeCobrar ? secundario : `${boton} min-h-14 text-lg`} disabled={guardando}>Guardar pedido</button><button type="button" className="min-h-12 rounded-xl px-4 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50" disabled={guardando} onClick={() => { if (borrador.lineas.length && !window.confirm('¿Descartar los productos sin guardar?')) return; if (!agregando) { localStorage.removeItem(claveBorrador); setRecuperable(null) } setBorrador(null) }}>Cancelar</button></div>
      {puedeCobrar && <p className="text-xs text-slate-500">«Guardar y cobrar» manda el pedido a Cocina y abre el cobro. «Guardar pedido» lo manda a Cocina para cobrarlo después.</p>}
      </div></div>
      {borrador.lineas.length > 0 && <a href="#resumen-pedido" className="barra-pedido-movil"><span>🛒 {unidades} {unidades === 1 ? 'producto' : 'productos'}</span><strong>Ver pedido · Q {totalLineas(borrador.lineas.map((l) => ({ cantidad: l.cantidad, precio: productos.find((p) => p.id === l.producto_id)?.precio ?? '0' })))}</strong></a>}
    </form>}
    {seleccionado && !borrador && !cobro && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-bold">Pedido {seleccionado.folio}</h2><p>{seleccionado.tipo_venta.nombre} · {seleccionado.mesa_referencia || seleccionado.cliente_nombre} · {estados[seleccionado.estado]}</p><p>{seleccionado.cliente_telefono && `Teléfono: ${seleccionado.cliente_telefono}`}</p><p>{seleccionado.cliente_direccion && `Dirección: ${seleccionado.cliente_direccion}`}</p><p>Tomado por {seleccionado.usuario.nombre} a las {hora(seleccionado.creado_en)}</p></div>{editable && <button className={boton} disabled={guardando} onClick={() => comenzar(true)}>Agregar productos</button>}</div>
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
    {!borrador && !cobro && <section className="space-y-4" aria-label="Pedidos guardados"><h2 className="text-xl font-bold">Pedidos guardados</h2>
    <div className="flex flex-wrap gap-2">{[['TODOS','Todos'],['PENDIENTES','Pendientes de cobro'],['PAGADO','Pagados'],['ANULADO','Anulados']].map(([codigo,nombre]) => <button type="button" key={codigo} className={filtroPedido === codigo ? boton : secundario} aria-pressed={filtroPedido === codigo} onClick={() => setFiltroPedido(codigo)}>{nombre} ({pedidos.filter(p => corresponde(p,codigo)).length})</button>)}</div>
    <label className="block">Fecha de pedidos<input type="date" className={campo} value={fechaPedidos} onChange={e => { setFechaPedidos(e.target.value); setVerAnteriores(false); setSeleccionado(null) }} /></label><label className="inline-flex min-h-12 items-center gap-2"><input type="checkbox" disabled={!!fechaPedidos} checked={verAnteriores} onChange={e => setVerAnteriores(e.target.checked)} />Incluir abiertos de días anteriores</label>
    <label className="block">Buscar por folio, mesa, cliente o teléfono<input className={campo} value={buscar} onChange={(e) => setBuscar(e.target.value)} /></label>
    {cargando ? <p>Cargando pedidos…</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((p) => <button disabled={guardando || !!borrador} className="min-h-32 rounded-2xl border border-slate-200 bg-white p-4 text-left disabled:opacity-50" key={p.id} onClick={() => { setSeleccionado(p); setAnulando(null); setError('') }} aria-label={`Ver pedido ${p.folio}`}><span className="block text-2xl font-bold">Pedido {p.folio} · {dinero(p.total)}</span><span className={`my-1 inline-block rounded-lg px-2 py-1 text-sm font-bold ${p.estado === 'PAGADO' ? 'bg-emerald-100 text-emerald-800' : p.estado === 'ANULADO' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>{p.estado === 'PAGADO' ? '✓ Pagado' : p.estado === 'ANULADO' ? '✕ Anulado' : `Falta cobrar ${dinero(p.saldo)}`}</span><span className="block">{p.fecha_operacion && `${p.fecha_operacion.split('-').reverse().join('/')} · `}{estados[p.estado]} · {hora(p.creado_en)}</span><span className="block">{p.mesa_referencia || p.cliente_nombre}</span>{p.estado_cocina && <span className="mt-2 inline-block rounded-lg bg-teal-50 px-2 py-1 font-semibold text-teal-800">Cocina: {nombresCocina[p.estado_cocina]}</span>}</button>)}</div>}
    {!cargando && !visible.length && <p>No hay pedidos con esos filtros para la fecha elegida.</p>}
    </section>}
    {buscandoCliente && borrador && <BuscarCliente inicial={borrador.cliente_telefono ?? ''} cerrar={() => setBuscandoCliente(false)} elegir={c => { setBorrador({ ...borrador, cliente_id: c.id, cliente_version: c.version, cliente_nombre: c.nombre, cliente_telefono: c.telefono, cliente_direccion: c.direccion ?? '', actualizar_cliente: false }); setBuscandoCliente(false) }} />}
    {eliminarPedido && <MovimientoPapelera tipo="pedidos" registro={{ id: eliminarPedido.id, version: eliminarPedido.version, nombre: `Pedido ${eliminarPedido.folio} · ${eliminarPedido.fecha_operacion ?? ''}` }} cerrar={() => setEliminarPedido(null)} terminar={() => { setEliminarPedido(null); setSeleccionado(null); setAviso('Pedido enviado a la papelera.'); void actualizar() }} />}
  </div>
}
