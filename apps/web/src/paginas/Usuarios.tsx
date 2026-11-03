import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { LoaderCircle, Pencil, UserPlus } from 'lucide-react'
import { ErrorApi } from '@/lib/api'
import { PermisosRoles } from '@/componentes/PermisosRoles'
import { useCambiosSinGuardar } from '@/hooks/useCambiosSinGuardar'
import { cn } from '@/lib/utils'
import { useSesion } from '@/sesion/SesionProvider'
import { NOMBRE_ROL, type CentroVenta, type Rol, type UsuarioSistema } from '@/sesion/tipos'

interface UsuarioListado {
  id: number
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  firebaseUid: string
  centros: CentroVenta[]
}

const ROLES: Rol[] = ['ADMIN', 'GERENTE', 'CAJERO', 'MESERO', 'COCINA']

const claseCampo =
  'block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-teal-600 focus:ring-3 focus:ring-teal-600/30'

const mensajeDe = (error: unknown) =>
  error instanceof ErrorApi ? error.message : 'Ocurrió un error inesperado. Intenta de nuevo.'

/** Administración de usuarios (solo ADMIN): crear, cambiar rol y centros, activar o desactivar. */
export function Usuarios({ usuario: yo }: { usuario: UsuarioSistema }) {
  const { api } = useSesion()
  const [usuarios, setUsuarios] = useState<UsuarioListado[] | null>(null)
  const [centros, setCentros] = useState<CentroVenta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [editando, setEditando] = useState<UsuarioListado | 'nuevo' | null>(null)
  const [buscar, setBuscar] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroCentro, setFiltroCentro] = useState('')
  const [pendienteFirebase, setPendienteFirebase] = useState<{ id: number; activo: boolean } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [lista, listaCentros] = await Promise.all([
        api<UsuarioListado[]>('/usuarios'),
        api<CentroVenta[]>('/centros'),
      ])
      setUsuarios(lista)
      setCentros(listaCentros)
      setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    }
  }, [api])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function cambiarActivo(u: UsuarioListado, activo = !u.activo) {
    setAviso(null)
    try {
      const r = await api<{ sincronizacion?: { sincronizado: boolean; aviso?: string } }>(`/usuarios/${u.id}/activo`, { method: 'PATCH', body: JSON.stringify({ activo }) })
      setAviso(r.sincronizacion?.aviso ?? (activo ? `${u.nombre} quedó activo.` : `${u.nombre} quedó desactivado.`))
      setPendienteFirebase(r.sincronizacion?.sincronizado === false ? { id: u.id, activo } : null)
      await cargar()
    } catch (e) {
      setError(mensajeDe(e))
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">Usuarios</h1>
        <button
          type="button"
          onClick={() => setEditando('nuevo')}
          className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-teal-700 px-6 text-lg font-semibold text-white hover:bg-teal-800"
        >
          <UserPlus className="size-6" aria-hidden />
          Nuevo usuario
        </button>
      </div>

      <PermisosRoles />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>Buscar usuario<input className={claseCampo} value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Nombre o correo" /></label>
        <label>Filtrar rol<select className={claseCampo} value={filtroRol} onChange={e => setFiltroRol(e.target.value)}><option value="">Todos</option>{ROLES.map(r => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}</select></label>
        <label>Filtrar estado<select className={claseCampo} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}><option value="">Todos</option><option value="activo">Activos</option><option value="inactivo">Desactivados</option></select></label>
        <label>Filtrar centro<select className={claseCampo} value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}><option value="">Todos</option>{centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      </div>
      {pendienteFirebase && <button className="mb-4 min-h-12 rounded-xl border px-4" onClick={() => { const u = usuarios?.find(u => u.id === pendienteFirebase.id); if (u) void cambiarActivo(u, pendienteFirebase.activo) }}>Reintentar sincronización con Firebase</button>}
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-800">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-800">
          {aviso}
        </p>
      )}

      {editando && (
        <FormularioUsuario
          key={editando === 'nuevo' ? 'nuevo' : editando.id}
          usuario={editando === 'nuevo' ? null : editando}
          centros={centros}
          alCancelar={() => setEditando(null)}
          alGuardar={async (texto) => {
            setEditando(null)
            setAviso(texto)
            await cargar()
          }}
        />
      )}

      {!usuarios && !error && (
        <p className="flex items-center gap-2 text-lg text-slate-600">
          <LoaderCircle className="size-6 animate-spin" aria-hidden /> Cargando usuarios…
        </p>
      )}

      {usuarios && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-base">
            <thead className="bg-slate-50 text-sm uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Centros</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.filter(u => `${u.nombre} ${u.email}`.toLocaleLowerCase('es').includes(buscar.trim().toLocaleLowerCase('es')) && (!filtroRol || u.rol === filtroRol) && (!filtroEstado || u.activo === (filtroEstado === 'activo')) && (!filtroCentro || u.rol === 'ADMIN' || u.centros.some(c => c.id === Number(filtroCentro)))).map((u) => (
                <tr key={u.id} className={cn('border-t border-slate-100', !u.activo && 'text-slate-400')}>
                  <td className="px-4 py-3">
                    <span className="block font-semibold">{u.nombre}</span>
                    <span className="block text-sm text-slate-500">{u.email}</span>
                  </td>
                  <td className="px-4 py-3">{NOMBRE_ROL[u.rol]}</td>
                  <td className="px-4 py-3">
                    {u.rol === 'ADMIN' ? 'Todos' : u.centros.map((c) => c.nombre).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-3 py-1 text-sm font-semibold',
                        u.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600',
                      )}
                    >
                      {u.activo ? 'Activo' : 'Desactivado'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditando(u)}
                        aria-label={`Editar a ${u.nombre}`}
                        className="inline-flex min-h-12 items-center gap-1 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        <Pencil className="size-4" aria-hidden /> Editar
                      </button>
                      {u.id !== yo.id && (
                        <button
                          type="button"
                          onClick={() => void cambiarActivo(u)}
                          className={cn(
                            'min-h-12 rounded-xl px-4 font-semibold',
                            u.activo
                              ? 'bg-red-50 text-red-700 hover:bg-red-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                          )}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FormularioUsuario({
  usuario,
  centros,
  alCancelar,
  alGuardar,
}: {
  usuario: UsuarioListado | null
  centros: CentroVenta[]
  alCancelar: () => void
  alGuardar: (aviso: string) => Promise<void>
}) {
  const { api } = useSesion()
  const esNuevo = usuario === null
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? 'MESERO')
  const [elegidos, setElegidos] = useState<number[]>(usuario?.centros.map((c) => c.id) ?? [])
  const [modo, setModo] = useState<'contrasena' | 'uid'>('contrasena')
  const [contrasena, setContrasena] = useState('')
  const [firebaseUid, setFirebaseUid] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [modificado, setModificado] = useState(false)
  useCambiosSinGuardar(modificado)

  function alternarCentro(id: number) {
    setElegidos((actual) => (actual.includes(id) ? actual.filter((c) => c !== id) : [...actual, id]))
  }

  async function alEnviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (rol !== 'ADMIN' && elegidos.length === 0) {
      setError('Asigna al menos un centro de venta.')
      return
    }
    setGuardando(true)
    try {
      if (esNuevo) {
        await api('/usuarios', {
          method: 'POST',
          body: JSON.stringify({
            nombre,
            email,
            rol,
            centros: elegidos,
            ...(modo === 'contrasena' ? { contrasena } : { firebaseUid }),
          }),
        })
        await alGuardar(`${nombre.trim()} quedó creado.`)
      } else {
        await api(`/usuarios/${usuario.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ nombre, rol, centros: elegidos }),
        })
        await alGuardar(`Se guardaron los cambios de ${nombre.trim()}.`)
      }
    } catch (err) {
      setError(mensajeDe(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      onChange={() => setModificado(true)}
      onSubmit={alEnviar}
      noValidate
      aria-label={esNuevo ? 'Nuevo usuario' : 'Editar usuario'}
      className="mb-6 rounded-2xl border border-teal-200 bg-white p-6 shadow-sm"
    >
      <h2 className="mb-4 text-2xl font-bold text-slate-900">{esNuevo ? 'Nuevo usuario' : `Editar a ${usuario.nombre}`}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium text-slate-800">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={claseCampo} />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium text-slate-800">Correo</span>
          <input
            type="email"
            value={email}
            disabled={!esNuevo}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(claseCampo, !esNuevo && 'bg-slate-100 text-slate-500')}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium text-slate-800">Rol</span>
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} className={claseCampo}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_ROL[r]}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="mb-1 block font-medium text-slate-800">
            Centros de venta {rol === 'ADMIN' && <span className="text-sm text-slate-500">(el administrador puede en todos)</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {centros.map((c) => (
              <label
                key={c.id}
                className={cn(
                  'inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-4',
                  elegidos.includes(c.id) ? 'border-teal-600 bg-teal-50' : 'border-slate-300',
                )}
              >
                <input
                  type="checkbox"
                  checked={elegidos.includes(c.id)}
                  onChange={() => alternarCentro(c.id)}
                  className="size-5 accent-teal-700"
                />
                {c.nombre}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {esNuevo && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <div className="mb-3 flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-base">
              <input type="radio" checked={modo === 'contrasena'} onChange={() => setModo('contrasena')} className="size-5 accent-teal-700" />
              Crear también en Firebase con una contraseña inicial
            </label>
            <label className="inline-flex items-center gap-2 text-base">
              <input type="radio" checked={modo === 'uid'} onChange={() => setModo('uid')} className="size-5 accent-teal-700" />
              Ya existe en Firebase (tengo su UID)
            </label>
          </div>
          {modo === 'contrasena' ? (
            <label className="block">
              <span className="mb-1 block font-medium text-slate-800">Contraseña inicial (mínimo 6 caracteres)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                className={claseCampo}
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block font-medium text-slate-800">UID del usuario en Firebase</span>
              <input value={firebaseUid} onChange={(e) => setFirebaseUid(e.target.value)} className={claseCampo} />
            </label>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-800">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={alCancelar} className="min-h-14 rounded-xl bg-slate-100 px-6 text-lg font-semibold text-slate-700 hover:bg-slate-200">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-teal-700 px-8 text-lg font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {guardando && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
          {esNuevo ? 'Crear usuario' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
