import { useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { useCambiosSinGuardar } from '@/hooks/useCambiosSinGuardar'

export function AccionControl({
  tipo,
  pedidoId,
  referencia,
  etiqueta,
  alGuardar,
}: {
  tipo: string
  pedidoId: string
  referencia?: string
  etiqueta: string
  alGuardar?: () => void | Promise<void>
}) {
  const { api, estado } = useSesion()
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [intento, setIntento] = useState<{ id: string; motivo: string } | null>(
    null,
  )
  useCambiosSinGuardar(!!motivo || intento !== null)
  const gerente =
    estado?.tipo === 'activa' &&
    ['ADMIN', 'GERENTE'].includes(estado.usuario.rol)
  return (
    <details className="rounded-xl border border-slate-200 p-3">
      <summary className="min-h-10 cursor-pointer font-semibold text-teal-800">
        {etiqueta}
      </summary>
      {tipo === 'ANULAR_PAGO' && (
        <p className="my-2 text-sm">
          Solo corrige el registro en SirInventari. La devolución o anulación
          del POS se realiza por separado.
        </p>
      )}
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void (async () => {
            setOcupado(true)
            setMensaje('')
            const datos = intento ?? { id: crypto.randomUUID(), motivo }
            setIntento(datos)
            try {
              const s = await api<{ id: string }>('/control/solicitudes', {
                method: 'POST',
                body: JSON.stringify({
                  ...datos,
                  tipo,
                  pedido_id: pedidoId,
                  referencia,
                }),
              })
              if (gerente)
                await api(`/control/solicitudes/${s.id}/resolver`, {
                  method: 'POST',
                  body: JSON.stringify({ aprobar: true }),
                })
              setMensaje(
                gerente
                  ? 'Acción autorizada y guardada.'
                  : 'Solicitud enviada. Un gerente debe revisarla en Inicio.',
              )
              setIntento(null)
              setMotivo('')
              await alGuardar?.()
            } catch (error) {
              setMensaje(
                error instanceof Error
                  ? error.message
                  : 'No se pudo guardar la solicitud.',
              )
            } finally {
              setOcupado(false)
            }
          })()
        }}
      >
        <label className="grow">
          Motivo de {etiqueta.toLocaleLowerCase('es')}
          <input
            className="block min-h-12 w-full rounded-xl border bg-white px-3"
            required
            maxLength={300}
            value={motivo}
            disabled={ocupado || !!intento}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
        <button
          className="min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
          disabled={ocupado}
        >
          {ocupado
            ? 'Guardando…'
            : intento
              ? 'Reintentar solicitud'
              : gerente
                ? 'Autorizar y guardar'
                : 'Solicitar autorización'}
        </button>
        {intento && !ocupado && (
          <button
            type="button"
            className="min-h-12 rounded-xl border px-4"
            onClick={() => {
              setIntento(null)
              setMensaje(
                'Puedes crear una nueva solicitud. Revisa en Inicio si la anterior quedó pendiente.',
              )
            }}
          >
            Nueva solicitud
          </button>
        )}
      </form>
      {mensaje && (
        <p role="status" className="mt-3 text-sm">
          {mensaje}
        </p>
      )}
    </details>
  )
}

interface Solicitud {
  id: string
  tipo: string
  motivo: string
  estado: string
  referencia: string | null
  solicitado_en: string
  pedido: { folio: number; fecha_operacion: string }
  usuario_solicitud_autorizacion_solicitado_porTousuario: { nombre: string }
}
export function Autorizaciones() {
  const { api, estado } = useSesion()
  const [lista, setLista] = useState<Solicitud[] | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const gerente =
    estado?.tipo === 'activa' &&
    ['ADMIN', 'GERENTE'].includes(estado.usuario.rol)
  const cargar = async () => {
    try {
      setLista(await api<Solicitud[]>('/control/solicitudes'))
    } catch (e) {
      setMensaje(
        e instanceof Error
          ? e.message
          : 'No se pudieron consultar las solicitudes.',
      )
    }
  }
  return (
    <section className="mt-8 rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">
        {gerente ? 'Autorizaciones del centro' : 'Mis solicitudes'}
      </h2>
      <button
        className="my-3 min-h-12 rounded-xl border px-4"
        disabled={ocupado}
        onClick={() => void cargar()}
      >
        Consultar solicitudes
      </button>
      {lista?.length === 0 && <p>No hay solicitudes.</p>}
      <ul className="space-y-3">
        {lista?.map((s) => (
          <li className="rounded-xl border p-4" key={s.id}>
            <p className="font-semibold">
              Pedido {s.pedido.folio} · {s.tipo.replaceAll('_', ' ')} ·{' '}
              {s.estado}
            </p>
            <p>
              {s.usuario_solicitud_autorizacion_solicitado_porTousuario.nombre}{' '}
              ·{' '}
              {new Date(s.solicitado_en).toLocaleString('es-GT', {
                timeZone: 'America/Guatemala',
              })}
            </p>
            <p>Motivo: {s.motivo}</p>
            {gerente && s.estado === 'PENDIENTE' && (
              <div className="mt-2 flex gap-2">
                {[true, false].map((aprobar) => (
                  <button
                    key={String(aprobar)}
                    disabled={ocupado}
                    className="min-h-12 rounded-xl border px-4"
                    onClick={() => {
                      if (
                        aprobar &&
                        !window.confirm(
                          `¿Autorizar ${s.tipo.replaceAll('_', ' ')} del pedido ${s.pedido.folio}? Motivo: ${s.motivo}`,
                        )
                      )
                        return
                      setOcupado(true)
                      void api(`/control/solicitudes/${s.id}/resolver`, {
                        method: 'POST',
                        body: JSON.stringify({ aprobar }),
                      })
                        .then(cargar)
                        .catch((e: unknown) =>
                          setMensaje(
                            e instanceof Error
                              ? e.message
                              : 'No se pudo resolver.',
                          ),
                        )
                        .finally(() => setOcupado(false))
                    }}
                  >
                    {aprobar ? 'Autorizar' : 'Rechazar'}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {mensaje && <p role="alert">{mensaje}</p>}
    </section>
  )
}
