import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ErrorApi } from '@/lib/api'
import { useSesion } from '@/sesion/SesionProvider'
import { EliminarRegistro, PreciosLote } from '@/componentes/AdministracionRegistros'
import { confirmarSalida, useCambiosSinGuardar } from '@/hooks/useCambiosSinGuardar'

interface Categoria { id: number; nombre: string; orden: number; activo: boolean }
interface Producto {
  id: number; sku: string; nombre: string; categoria_id: number; precio_base: string
  activo: boolean; precio_centro: string | null; precio: string; disponible: boolean; disponible_venta: boolean
  grupo_variantes?: string | null; es_complemento?: boolean; foto_datos?: string | null
}
const campo = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base'
const boton = 'min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50'
const secundario = 'min-h-12 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 disabled:opacity-50'
const mensaje = (e: unknown) => e instanceof ErrorApi ? e.message : 'No se pudo guardar. Intenta de nuevo.'
const quetzales = (n: string) => `Q ${Number(n).toFixed(2)}`

export function Catalogo() {
  const { api, centro } = useSesion()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [buscar, setBuscar] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [estadoProducto, setEstadoProducto] = useState('')
  const [editando, setEditando] = useState<Producto | 'nuevo' | null>(null)
  const [categoriaEditada, setCategoriaEditada] = useState<Categoria | 'nueva' | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [vista, setVista] = useState<'productos' | 'categorias'>('productos')

  const cargar = useCallback(async () => {
    const [cs, ps] = await Promise.all([api<Categoria[]>('/catalogo/categorias'), api<Producto[]>('/catalogo/productos')])
    setCategorias(cs)
    setProductos(ps)
  }, [api])

  useEffect(() => {
    let vigente = true
    Promise.all([api<Categoria[]>('/catalogo/categorias'), api<Producto[]>('/catalogo/productos')])
      .then(([cs, ps]) => { if (vigente) { setCategorias(cs); setProductos(ps); setError('') } })
      .catch((e: unknown) => { if (vigente) setError(mensaje(e)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [api])

  async function guardar(ruta: string, datos: object, nuevo = false) {
    setGuardando(true)
    setError('')
    setAviso('')
    try {
      await api(ruta, { method: nuevo ? 'POST' : 'PATCH', body: JSON.stringify(datos) })
      if (nuevo) { setEditando(null); setCategoriaEditada(null) }
      setAviso('Los cambios quedaron guardados.')
      try { await cargar() } catch { setError('Los cambios se guardaron, pero no se pudo actualizar la lista. Reintenta la carga.') }
      return true
    } catch (e) { setError(mensaje(e)); return false }
    finally { setGuardando(false) }
  }

  const visibles = productos.filter((p) =>
    (!categoriaId || p.categoria_id === Number(categoriaId)) && (!estadoProducto || estadoProducto==='disponible'&&p.disponible_venta || estadoProducto==='agotado'&&p.activo&&!p.disponible || estadoProducto==='desactivado'&&!p.activo) && `${p.nombre} ${p.sku}`.toLocaleLowerCase('es').includes(buscar.toLocaleLowerCase('es')),
  )

  function cerrarEditor() {
    if (!guardando && confirmarSalida()) { setEditando(null); setCategoriaEditada(null); setError(''); setAviso('') }
  }
  const editor = editando !== null || categoriaEditada !== null
  const mensajes = <>{error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{aviso && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{aviso}</p>}</>
  return <div className="catalogo-ordenado mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Catálogo</h1><p className="text-slate-600">Precios y disponibilidad en {centro?.nombre}.</p></div>
      <button className={boton} disabled={guardando || cargando} onClick={() => { setError(''); setAviso(''); if (vista === 'productos') setEditando('nuevo'); else setCategoriaEditada('nueva') }}>{vista === 'productos' ? 'Nuevo producto' : 'Nueva categoría'}</button>
    </div>
    <nav aria-label="Secciones del catálogo" className="flex gap-2 border-b border-slate-200 pb-3"><button className={vista === 'productos' ? boton : secundario} aria-pressed={vista === 'productos'} onClick={() => setVista('productos')}>Productos ({productos.length})</button><button className={vista === 'categorias' ? boton : secundario} aria-pressed={vista === 'categorias'} onClick={() => setVista('categorias')}>Categorías ({categorias.length})</button></nav>
    {!editor && mensajes}
    {!editor && error && <button className={secundario} onClick={() => void cargar().then(() => setError('')).catch((e: unknown) => setError(mensaje(e)))}>Reintentar carga</button>}
    {editor && <EditorCatalogo titulo={editando ? editando === 'nuevo' ? 'Nuevo producto' : 'Editar producto' : categoriaEditada === 'nueva' ? 'Nueva categoría' : 'Editar categoría'} ocupado={guardando} cerrar={cerrarEditor}>
      {mensajes}
      {editando && <FormularioProducto key={editando === 'nuevo' ? 'nuevo' : editando.id} producto={editando === 'nuevo' ? null : editando} categorias={categorias} guardando={guardando} guardar={guardar} cancelar={cerrarEditor} centro={centro?.nombre ?? ''} />}
      {categoriaEditada && <FormularioCategoria key={categoriaEditada === 'nueva' ? 'nueva' : categoriaEditada.id} categoria={categoriaEditada === 'nueva' ? null : categoriaEditada} guardar={guardar} guardando={guardando} cancelar={cerrarEditor} />}
    </EditorCatalogo>}
    {vista === 'categorias' && <section className="space-y-4" aria-label="Categorías del menú"><p className="text-slate-600">Las categorías agrupan tus productos. El orden más bajo aparece primero. Desactivar una categoría impide vender sus productos.</p><div className="grid gap-3 md:grid-cols-2">{categorias.map(c => <article key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-4 flex justify-between gap-3"><div><h2 className="font-bold">{c.nombre}</h2><p className="text-sm text-slate-500">Orden {c.orden} · {productos.filter(p => p.categoria_id === c.id).length} productos</p></div><span className={c.activo ? 'etiqueta-catalogo disponible' : 'etiqueta-catalogo inactivo'}>{c.activo ? 'Activa' : 'Desactivada'}</span></div><div className="acciones-catalogo"><button className={secundario} disabled={guardando} aria-label={`Editar categoría ${c.nombre}`} onClick={() => { setError(''); setAviso(''); setCategoriaEditada(c) }}>Editar</button><button className={secundario} disabled={guardando} aria-label={`${c.activo ? 'Desactivar' : 'Activar'} categoría ${c.nombre}`} onClick={() => { if (c.activo && !window.confirm(`¿Desactivar ${c.nombre}? Sus productos dejarán de venderse. Se conserva el historial.`)) return; void guardar(`/catalogo/categorias/${c.id}`, { activo: !c.activo }) }}>{c.activo ? 'Desactivar' : 'Activar'}</button><EliminarRegistro recurso="categorias" id={c.id} nombre={c.nombre} etiqueta="Eliminar" deshabilitado={guardando} alGuardar={cargar} /></div></article>)}</div>{!cargando && !categorias.length && <p>No hay categorías. Crea la primera para organizar tus productos.</p>}</section>}
    {vista === 'productos' && <>
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3">
      <label>Buscar por nombre o SKU<input className={campo} value={buscar} onChange={(e) => setBuscar(e.target.value)} /></label>
      <label>Filtrar por categoría<select className={campo} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}><option value="">Todas</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <label>Estado del producto<select className={campo} value={estadoProducto} onChange={e=>setEstadoProducto(e.target.value)}><option value="">Todos</option><option value="disponible">Disponibles</option><option value="agotado">Agotados en este centro</option><option value="desactivado">Desactivados</option></select></label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-600">{visibles.length} de {productos.length} productos · Agotado solo afecta a este centro; Desactivar afecta a todos.</p><button className={secundario} onClick={() => { setBuscar(''); setCategoriaId(''); setEstadoProducto('') }}>Limpiar filtros</button></div>
    {cargando ? <p role="status">Cargando catálogo…</p> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left"><thead className="bg-slate-50"><tr>{['Producto', 'Categoría', 'Precio de venta', 'Estado', 'Acciones'].map((t) => <th key={t} className="p-3">{t}</th>)}</tr></thead>
        <tbody>{visibles.map((p) => <tr key={p.id} className="border-t border-slate-100">
          <td className="p-3">{p.foto_datos&&<img src={p.foto_datos} alt="" className="mb-2 size-16 rounded-xl object-cover" loading="lazy"/>}<span className="block font-semibold">{p.nombre}</span><span className="text-sm text-slate-500">{p.sku}</span>{p.grupo_variantes&&<span className="block text-sm">Grupo: {p.grupo_variantes}</span>}{p.es_complemento&&<span className="block text-sm">Complemento</span>}</td>
          <td className="p-3">{categorias.find((c) => c.id === p.categoria_id)?.nombre}</td>
          <td className="p-3"><strong className="whitespace-nowrap">{quetzales(p.precio)}</strong><span className="block text-xs text-slate-500">{p.precio_centro === null ? 'Usa precio base' : 'Precio propio'}</span>{p.precio_centro !== null && <span className="block text-xs text-slate-500">Base: {quetzales(p.precio_base)}</span>}</td>
          <td className="p-3"><span className={p.disponible_venta ? 'etiqueta-catalogo disponible' : 'etiqueta-catalogo inactivo'}>{!p.activo ? 'Desactivado' : !categorias.find(c => c.id === p.categoria_id)?.activo ? 'Categoría desactivada' : !p.disponible ? 'Agotado' : 'Disponible'}</span></td>
          <td className="p-3"><div className="acciones-catalogo"><button className={secundario} disabled={guardando} aria-label={`Editar producto ${p.nombre}`} onClick={() => { setError(''); setAviso(''); setEditando(p); setCategoriaEditada(null) }}>Editar</button><button className={secundario} disabled={guardando} aria-label={`${p.activo ? 'Desactivar' : 'Activar'} producto ${p.nombre}`} onClick={() => { if (p.activo && !window.confirm(`¿Desactivar ${p.nombre}? Dejará de venderse en todos los centros. Se conserva el historial.`)) return; void guardar(`/catalogo/productos/${p.id}`, { activo: !p.activo }) }}>{p.activo ? 'Desactivar' : 'Activar'}</button><button className={secundario} disabled={guardando || !p.activo} aria-label={`${p.disponible ? 'Marcar agotado' : 'Marcar disponible'} ${p.nombre}`} onClick={() => void guardar(`/catalogo/productos/${p.id}/centro`, { disponible: !p.disponible })}>{p.disponible ? 'Agotado' : 'Disponible'}</button><EliminarRegistro recurso="productos" id={p.id} nombre={p.nombre} etiqueta="Eliminar" deshabilitado={guardando} alGuardar={cargar} /></div></td>
        </tr>)}</tbody></table>{visibles.length === 0 && <p className="p-4">No hay productos con esos filtros.</p>}
    </div>}
    <PreciosLote productos={visibles} alGuardar={cargar} />
    </>}
  </div>
}

function EditorCatalogo({ titulo, ocupado, cerrar, children }: { titulo: string; ocupado: boolean; cerrar: () => void; children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialogo.current
    if (!d) return
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
    return () => { if (typeof d.close === 'function') d.close() }
  }, [])
  return <dialog ref={dialogo} aria-label={titulo} className="editor-catalogo" onCancel={e => { e.preventDefault(); cerrar() }}><div className="cabecera-editor-catalogo"><h2 className="text-xl font-bold">{titulo}</h2><button className={secundario} disabled={ocupado} onClick={cerrar}>Cerrar</button></div><div className="space-y-4 p-5">{children}</div></dialog>
}

type Guardar = (ruta: string, datos: object, nuevo?: boolean) => Promise<boolean>

function FormularioCategoria({ categoria, guardar, guardando, cancelar }: { categoria: Categoria | null; guardar: Guardar; guardando: boolean; cancelar: () => void }) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [orden, setOrden] = useState(categoria?.orden ?? 0)
  const [activo, setActivo] = useState(categoria?.activo ?? true)
  const [modificado,setModificado]=useState(false)
  useCambiosSinGuardar(modificado)
  return <form onChange={()=>setModificado(true)} aria-label="Categoría" className="mb-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void guardar(`/catalogo/categorias${categoria ? `/${categoria.id}` : ''}`, { nombre, orden, activo }, !categoria).then(ok => { if (ok) setModificado(false) }) }}>
    <fieldset disabled={guardando} className="contents">
    <label>Nombre de categoría<input required maxLength={60} className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
    <label>Orden<input type="number" required min={-32768} max={32767} step={1} className={campo} value={orden} onChange={(e) => setOrden(Number(e.target.value))} /></label>
    <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="size-5" checked={activo} onChange={(e) => setActivo(e.target.checked)} />Categoría activa</label>
    <div className="flex gap-2"><button className={boton} disabled={guardando}>Guardar categoría</button><button type="button" className={secundario} disabled={guardando} onClick={cancelar}>Cancelar</button></div>
    </fieldset>
  </form>
}

function FormularioProducto({ producto: p, categorias, guardar, guardando, cancelar, centro }: { producto: Producto | null; categorias: Categoria[]; guardar: Guardar; guardando: boolean; cancelar: () => void; centro: string }) {
  const [nombre, setNombre] = useState(p?.nombre ?? '')
  const [sku, setSku] = useState(p?.sku ?? '')
  const [categoriaId, setCategoriaId] = useState(String(p?.categoria_id ?? ''))
  const [precioBase, setPrecioBase] = useState(p?.precio_base ?? '')
  const [activo, setActivo] = useState(p?.activo ?? true)
  const [precioCentro, setPrecioCentro] = useState(p?.precio_centro ?? '')
  const [disponible, setDisponible] = useState(p?.disponible ?? true)
  const [grupo,setGrupo]=useState(p?.grupo_variantes??'')
  const [complemento,setComplemento]=useState(p?.es_complemento??false)
  const [foto,setFoto]=useState(p?.foto_datos??null)
  const [errorFoto,setErrorFoto]=useState('')
  const [modificado,setModificado]=useState(false)
  const [centroModificado, setCentroModificado] = useState(false)
  useCambiosSinGuardar(modificado || centroModificado)
  function enviar(e: FormEvent) {
    e.preventDefault()
    void guardar(`/catalogo/productos${p ? `/${p.id}` : ''}`, { nombre, sku, categoria_id: Number(categoriaId), precio_base: precioBase, activo, grupo_variantes: grupo || null, es_complemento: complemento, foto_datos: foto }, !p).then(ok => { if (ok) setModificado(false) })
  }
  return <section className="space-y-4">
    <h2 className="mb-4 text-xl font-bold">{p ? `Editar ${p.nombre}` : 'Nuevo producto'}</h2>
    <p className="text-sm text-slate-600">Datos generales y precio base: se comparten entre todos los centros.</p>
    <form aria-label="Producto" onChange={() => setModificado(true)} onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
      <fieldset disabled={guardando} className="contents">
      <label>Nombre del producto<input required maxLength={120} className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
      <label>SKU<input required maxLength={30} className={campo} value={sku} onChange={(e) => setSku(e.target.value)} /></label>
      <label>Categoría del producto<select required className={campo} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}><option value="">Elige una categoría</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}{!c.activo && ' (desactivada)'}</option>)}</select></label>
      <label>Precio base<input required type="number" min="0" max="99999999.99" step="0.01" className={campo} value={precioBase} onChange={(e) => setPrecioBase(e.target.value)} /></label>
      <details className="rounded-xl border border-slate-200 p-3 sm:col-span-2"><summary className="min-h-10 cursor-pointer font-semibold">Foto, tamaños y complementos (opcional)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label>Grupo de variantes o tamaños<input maxLength={120} className={campo} value={grupo} onChange={e=>setGrupo(e.target.value)} placeholder="Ej. Shuko Americano"/></label>
      <label className="flex min-h-12 items-center gap-2"><input type="checkbox" checked={complemento} onChange={e=>setComplemento(e.target.checked)}/>Es un extra o complemento</label>
      <label>Foto opcional (PNG, JPEG o WebP, máximo 200 KB)<input type="file" accept="image/png,image/jpeg,image/webp" className={campo} onChange={e=>{const archivo=e.target.files?.[0];if(!archivo)return;if(archivo.size>204800||!['image/png','image/jpeg','image/webp'].includes(archivo.type)){setErrorFoto('Elige una foto PNG, JPEG o WebP de hasta 200 KB.');return}const lector=new FileReader();lector.onload=()=>{setFoto(String(lector.result));setErrorFoto('')};lector.onerror=()=>setErrorFoto('No se pudo leer la foto.');lector.readAsDataURL(archivo)}}/></label>
      {foto&&<div><img src={foto} alt="Vista previa del producto" className="size-24 rounded-xl object-cover"/><button type="button" className={secundario} onClick={()=>{setFoto(null);setModificado(true)}}>Quitar foto</button></div>}{errorFoto&&<p role="alert">{errorFoto}</p>}
      </div></details>
      <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="size-5" checked={activo} onChange={(e) => setActivo(e.target.checked)} />Producto activo</label>
      <button className={boton} disabled={guardando}>Guardar producto</button>
      </fieldset>
    </form>
    {p && <form aria-label="Precio por centro" onChange={() => setCentroModificado(true)} className="mt-5 grid gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void guardar(`/catalogo/productos/${p.id}/centro`, { precio: precioCentro === '' ? null : precioCentro, disponible }).then(ok => { if (ok) setCentroModificado(false) }) }}>
      <fieldset disabled={guardando} className="contents">
      <h3 className="font-semibold sm:col-span-2">Solo en {centro}</h3>
      <p className="text-sm text-slate-600 sm:col-span-2">Guarda aquí el precio y disponibilidad de este centro. Los cambios de arriba se guardan con Guardar producto.</p>
      <label>Precio propio (vacío usa el base)<input type="number" min="0" max="99999999.99" step="0.01" className={campo} value={precioCentro} onChange={(e) => setPrecioCentro(e.target.value)} /></label>
      <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="size-5" checked={disponible} onChange={(e) => setDisponible(e.target.checked)} />Disponible en este centro</label>
      <button className={boton} disabled={guardando}>Guardar para este centro</button>
      </fieldset>
    </form>}
    <button type="button" className={`${secundario} mt-4`} disabled={guardando} onClick={cancelar}>Cancelar</button>
  </section>
}
