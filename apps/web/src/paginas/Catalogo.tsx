import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ErrorApi } from '@/lib/api'
import { useSesion } from '@/sesion/SesionProvider'

interface Categoria { id: number; nombre: string; orden: number; activo: boolean }
interface Producto {
  id: number; sku: string; nombre: string; categoria_id: number; precio_base: string
  activo: boolean; precio_centro: string | null; precio: string; disponible: boolean; disponible_venta: boolean
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
  const [editando, setEditando] = useState<Producto | 'nuevo' | null>(null)
  const [categoriaEditada, setCategoriaEditada] = useState<Categoria | 'nueva' | null>(null)
  const [guardando, setGuardando] = useState(false)

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
      setEditando(null)
      setCategoriaEditada(null)
      setAviso('Los cambios quedaron guardados.')
      await cargar()
    } catch (e) { setError(mensaje(e)) }
    finally { setGuardando(false) }
  }

  const visibles = productos.filter((p) =>
    (!categoriaId || p.categoria_id === Number(categoriaId)) && `${p.nombre} ${p.sku}`.toLocaleLowerCase('es').includes(buscar.toLocaleLowerCase('es')),
  )

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Catálogo</h1><p className="text-slate-600">Precios y disponibilidad en {centro?.nombre}.</p></div>
      <button className={boton} disabled={guardando} onClick={() => { setEditando('nuevo'); setCategoriaEditada(null) }}>Nuevo producto</button>
    </div>
    <p className="text-slate-600">El nombre, SKU, categoría y precio base se comparten entre centros. El precio propio y la disponibilidad se guardan solo en el centro elegido.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <button className="underline" onClick={() => void cargar().then(() => setError('')).catch((e: unknown) => setError(mensaje(e)))}>Reintentar carga</button></p>}
    {aviso && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{aviso}</p>}
    {editando && <FormularioProducto key={editando === 'nuevo' ? 'nuevo' : editando.id} producto={editando === 'nuevo' ? null : editando} categorias={categorias} guardando={guardando} guardar={guardar} cancelar={() => setEditando(null)} centro={centro?.nombre ?? ''} />}
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Categorías</h2><button className={secundario} disabled={guardando} onClick={() => { setCategoriaEditada('nueva'); setEditando(null) }}>Nueva categoría</button></div>
      {categoriaEditada && <FormularioCategoria key={categoriaEditada === 'nueva' ? 'nueva' : categoriaEditada.id} categoria={categoriaEditada === 'nueva' ? null : categoriaEditada} guardar={guardar} guardando={guardando} cancelar={() => setCategoriaEditada(null)} />}
      <ul className="flex flex-wrap gap-2">{categorias.map((c) => <li key={c.id}><button disabled={guardando} className={secundario} aria-label={`Editar categoría ${c.nombre}`} onClick={() => { setCategoriaEditada(c); setEditando(null) }}>{c.orden} · {c.nombre}{!c.activo && ' (desactivada)'}</button></li>)}</ul>
    </section>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Buscar por nombre o SKU<input className={campo} value={buscar} onChange={(e) => setBuscar(e.target.value)} /></label>
      <label>Filtrar por categoría<select className={campo} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}><option value="">Todas</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
    </div>
    {cargando ? <p role="status">Cargando catálogo…</p> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left"><thead className="bg-slate-50"><tr>{['Producto', 'Categoría', 'Precio base', 'Precio en este centro', 'Estado', 'Acciones'].map((t) => <th key={t} className="p-3">{t}</th>)}</tr></thead>
        <tbody>{visibles.map((p) => <tr key={p.id} className="border-t border-slate-100">
          <td className="p-3"><span className="block font-semibold">{p.nombre}</span><span className="text-sm text-slate-500">{p.sku}</span></td>
          <td className="p-3">{categorias.find((c) => c.id === p.categoria_id)?.nombre}</td>
          <td className="p-3">{quetzales(p.precio_base)}</td><td className="p-3">{quetzales(p.precio)}<span className="block text-sm text-slate-500">{p.precio_centro === null ? 'Usa precio base' : 'Precio propio'}</span></td>
          <td className="p-3">{p.disponible_venta ? 'Disponible' : !p.activo ? 'Desactivado' : 'No disponible'}</td>
          <td className="p-3"><button className={secundario} disabled={guardando} aria-label={`Editar producto ${p.nombre}`} onClick={() => { setEditando(p); setCategoriaEditada(null) }}>Editar</button></td>
        </tr>)}</tbody></table>{visibles.length === 0 && <p className="p-4">No hay productos con esos filtros.</p>}
    </div>}
  </div>
}

type Guardar = (ruta: string, datos: object, nuevo?: boolean) => Promise<void>

function FormularioCategoria({ categoria, guardar, guardando, cancelar }: { categoria: Categoria | null; guardar: Guardar; guardando: boolean; cancelar: () => void }) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [orden, setOrden] = useState(categoria?.orden ?? 0)
  const [activo, setActivo] = useState(categoria?.activo ?? true)
  return <form aria-label="Categoría" className="mb-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void guardar(`/catalogo/categorias${categoria ? `/${categoria.id}` : ''}`, { nombre, orden, activo }, !categoria) }}>
    <label>Nombre de categoría<input required maxLength={60} className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
    <label>Orden<input type="number" required min={-32768} max={32767} step={1} className={campo} value={orden} onChange={(e) => setOrden(Number(e.target.value))} /></label>
    <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="size-5" checked={activo} onChange={(e) => setActivo(e.target.checked)} />Categoría activa</label>
    <div className="flex gap-2"><button className={boton} disabled={guardando}>Guardar categoría</button><button type="button" className={secundario} disabled={guardando} onClick={cancelar}>Cancelar</button></div>
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
  function enviar(e: FormEvent) {
    e.preventDefault()
    void guardar(`/catalogo/productos${p ? `/${p.id}` : ''}`, { nombre, sku, categoria_id: Number(categoriaId), precio_base: precioBase, activo }, !p)
  }
  return <section className="rounded-2xl border border-teal-200 bg-white p-5">
    <h2 className="mb-4 text-xl font-bold">{p ? `Editar ${p.nombre}` : 'Nuevo producto'}</h2>
    <form aria-label="Producto" onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
      <label>Nombre del producto<input required maxLength={120} className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
      <label>SKU<input required maxLength={30} className={campo} value={sku} onChange={(e) => setSku(e.target.value)} /></label>
      <label>Categoría del producto<select required className={campo} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}><option value="">Elige una categoría</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}{!c.activo && ' (desactivada)'}</option>)}</select></label>
      <label>Precio base<input required type="number" min="0" max="99999999.99" step="0.01" className={campo} value={precioBase} onChange={(e) => setPrecioBase(e.target.value)} /></label>
      <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="size-5" checked={activo} onChange={(e) => setActivo(e.target.checked)} />Producto activo</label>
      <button className={boton} disabled={guardando}>Guardar producto</button>
    </form>
    {p && <form aria-label="Precio por centro" className="mt-5 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void guardar(`/catalogo/productos/${p.id}/centro`, { precio: precioCentro === '' ? null : precioCentro, disponible }) }}>
      <h3 className="font-semibold sm:col-span-2">Solo en {centro}</h3>
      <label>Precio propio (vacío usa el base)<input type="number" min="0" max="99999999.99" step="0.01" className={campo} value={precioCentro} onChange={(e) => setPrecioCentro(e.target.value)} /></label>
      <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="size-5" checked={disponible} onChange={(e) => setDisponible(e.target.checked)} />Disponible en este centro</label>
      <button className={boton} disabled={guardando}>Guardar para este centro</button>
    </form>}
    <button type="button" className={`${secundario} mt-4`} disabled={guardando} onClick={cancelar}>Cancelar</button>
  </section>
}
