import { useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { SECCIONES } from '@/secciones'
import type { Rol } from '@/sesion/tipos'
import { useCambiosSinGuardar } from '@/hooks/useCambiosSinGuardar'

export function EliminarRegistro({
  recurso,
  id,
  nombre,
  alGuardar,
  etiqueta,
  deshabilitado = false,
}: {
  recurso: string
  id: number
  nombre: string
  alGuardar: () => Promise<void>
  etiqueta?: string
  deshabilitado?: boolean
}) {
  const { api, estado } = useSesion()
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  if (estado?.tipo !== 'activa' || estado.usuario.rol !== 'ADMIN') return null
  return (
    <span className="inline-block">
      <button
        type="button"
        disabled={ocupado || deshabilitado}
        title={`Eliminar ${nombre}`}
        className="min-h-12 rounded-xl border border-red-200 px-3 text-red-800"
        onClick={() => {
          if (
            !window.confirm(
              `¿Eliminar ${nombre} de SirInventari? Solo se permite si no tiene historial.${recurso === 'usuarios' ? ' La cuenta de Firebase se conserva.' : ''}`,
            )
          )
            return
          setOcupado(true)
          void api(`/control/${recurso}/${id}`, { method: 'DELETE' })
            .then(alGuardar)
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : 'No se pudo eliminar.'),
            )
            .finally(() => setOcupado(false))
        }}
      >
        {etiqueta ?? `Eliminar ${nombre}`}
      </button>
      {error && (
        <span role="alert" className="block text-sm text-red-800">
          {error}
        </span>
      )}
    </span>
  )
}

export function PermisosUsuario({ id, rol }: { id: number; rol: Rol }) {
  const { api } = useSesion()
  const [lista, setLista] = useState<
    { modulo: string; accion: string; permitido: boolean }[] | null
  >(null)
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  if (rol === 'ADMIN')
    return <p>El administrador conserva todos los permisos.</p>
  const accionPorModulo: Record<string, string[]> = {
    pedidos: ['ver', 'crear', 'editar', 'anular', 'autorizar'],
    cocina: ['ver', 'editar', 'anular', 'autorizar'],
    caja: ['ver', 'crear', 'anular', 'autorizar'],
    turnos: ['ver', 'crear', 'editar'],
    catalogo: ['ver', 'crear', 'editar', 'anular'],
    reportes: ['ver'],
    clientes: ['ver', 'crear', 'editar', 'anular'],
    papelera: ['ver', 'editar', 'anular'],
  }
  return (
    <details className="my-4 rounded-xl border p-4">
      <summary className="min-h-10 cursor-pointer font-semibold">
        Permisos específicos de este usuario
      </summary>
      <p className="text-sm">
        Puedes restringir acciones dentro de su rol. Estos permisos no conceden
        otros módulos ni centros. El cambio se aplica en la API de inmediato; el
        menú se actualiza al recargar la sesión.
      </p>
      <button
        type="button"
        className="my-3 min-h-12 rounded-xl border px-4"
        onClick={() =>
          void api<typeof lista>(`/control/permisos/${id}`)
            .then(setLista)
            .catch((e: unknown) =>
              setMensaje(
                e instanceof Error ? e.message : 'No se pudo consultar.',
              ),
            )
        }
      >
        Cargar permisos
      </button>
      {lista && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {SECCIONES.filter((s) => s.roles.includes(rol)).map((s) => (
              <fieldset className="rounded-xl border p-3" key={s.ruta}>
                <legend className="font-semibold">{s.nombre}</legend>
                {(accionPorModulo[s.ruta.slice(1)] ?? [])
                  .filter((a) => a !== 'autorizar' || rol === 'GERENTE')
                  .map((accion) => {
                    const modulo = s.ruta.slice(1)
                    const marcado = !lista.some(
                      (p) =>
                        p.modulo === modulo &&
                        p.accion === accion &&
                        !p.permitido,
                    )
                    return (
                      <label
                        key={accion}
                        className="flex min-h-10 items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={ocupado}
                          onChange={(e) =>
                            setLista([
                              ...lista.filter(
                                (p) =>
                                  !(p.modulo === modulo && p.accion === accion),
                              ),
                              { modulo, accion, permitido: e.target.checked },
                            ])
                          }
                        />
                        {accion}
                      </label>
                    )
                  })}
              </fieldset>
            ))}
          </div>
          <button
            type="button"
            disabled={ocupado}
            className="mt-3 min-h-12 rounded-xl bg-teal-700 px-4 text-white"
            onClick={() => {
              setOcupado(true)
              void api(`/control/permisos/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ permisos: lista }),
              })
                .then(() => setMensaje('Permisos guardados.'))
                .catch((e: unknown) =>
                  setMensaje(
                    e instanceof Error ? e.message : 'No se pudo guardar.',
                  ),
                )
                .finally(() => setOcupado(false))
            }}
          >
            Guardar permisos específicos
          </button>
        </>
      )}
      {mensaje && (
        <p role="status" className="mt-2">
          {mensaje}
        </p>
      )}
    </details>
  )
}

export function PreciosLote({
  productos,
  alGuardar,
}: {
  productos: {
    id: number
    nombre: string
    precio_base: string
    precio_centro: string | null
    precio: string
  }[]
  alGuardar: () => Promise<void>
}) {
  const { api } = useSesion()
  const [alcance, setAlcance] = useState('centro')
  const [cambios, setCambios] = useState<Record<number, string>>({})
  const [confirmado, setConfirmado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const seleccionados = productos
    .filter((p) => cambios[p.id] !== undefined && cambios[p.id] !== '')
    .map((p) => ({
      producto_id: p.id,
      anterior: alcance === 'base' ? p.precio_base : p.precio_centro,
      nuevo: cambios[p.id],
    }))
  useCambiosSinGuardar(seleccionados.length > 0)
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="min-h-10 cursor-pointer font-semibold">
        Actualizar precios con vista previa
      </summary>
      <p className="my-2">
        Solo se cambian los productos donde escribas un precio nuevo. Se
        muestran hasta 200 de los productos filtrados.
      </p>
      <label>
        Alcance
        <select
          className="ml-2 min-h-12 rounded-xl border px-3"
          value={alcance}
          disabled={ocupado}
          onChange={(e) => {
            setAlcance(e.target.value)
            setCambios({})
            setConfirmado(false)
          }}
        >
          <option value="centro">Precio propio de este centro</option>
          <option value="base">Precio base compartido entre centros</option>
        </select>
      </label>
      <div className="my-3 max-h-80 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Anterior</th>
              <th>Nuevo Q</th>
            </tr>
          </thead>
          <tbody>
            {productos.slice(0, 200).map((p) => (
              <tr key={p.id}>
                <td className="py-2">Precio de {p.nombre}</td>
                <td>
                  {alcance === 'base'
                    ? p.precio_base
                    : (p.precio_centro ?? `Base ${p.precio_base}`)}
                </td>
                <td>
                  <input
                    aria-label={`Nuevo precio de ${p.nombre}`}
                    className="min-h-12 w-32 rounded-xl border px-3"
                    type="number"
                    min="0"
                    max="99999999.99"
                    step=".01"
                    disabled={ocupado}
                    value={cambios[p.id] ?? ''}
                    onChange={(e) => {
                      setCambios({ ...cambios, [p.id]: e.target.value })
                      setConfirmado(false)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Cambios en vista previa: {seleccionados.length}.{' '}
        {alcance === 'base'
          ? 'Afecta a los centros que usan el precio base.'
          : 'Afecta únicamente al centro elegido.'}
      </p>
      <label className="my-3 flex min-h-12 items-center gap-2">
        <input
          type="checkbox"
          checked={confirmado}
          disabled={ocupado}
          onChange={(e) => setConfirmado(e.target.checked)}
        />
        Revisé los precios anteriores y nuevos
      </label>
      <button
        disabled={ocupado || !confirmado || !seleccionados.length}
        className="min-h-12 rounded-xl bg-teal-700 px-4 text-white disabled:opacity-50"
        onClick={() => {
          setOcupado(true)
          void api('/catalogo/precios', {
            method: 'POST',
            body: JSON.stringify({ alcance, precios: seleccionados }),
          })
            .then(async () => {
              setCambios({})
              setConfirmado(false)
              setMensaje('Precios actualizados.')
              await alGuardar()
            })
            .catch((e: unknown) =>
              setMensaje(
                e instanceof Error ? e.message : 'No se pudo actualizar.',
              ),
            )
            .finally(() => setOcupado(false))
        }}
      >
        Aplicar precios revisados
      </button>
      {mensaje && <p role="status">{mensaje}</p>}
    </details>
  )
}
