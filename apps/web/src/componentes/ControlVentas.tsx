import { useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { convertirCsv } from '@/lib/csv'

interface Control {
  desde: string
  hasta: string
  resumen: {
    ventas_pagadas: string
    pagos_recibidos: string
    saldo_pendiente: string
    pedidos_pagados: number
  }
  comparacion: {
    desde: string
    hasta: string
    ventas: string
    pedidos: number
    diferencia: string
    variacion_porcentaje: string | null
  }
  por_centro: {
    id: number
    nombre: string
    ventas: string
    pedidos: number
    pagos_recibidos: string
    saldo_pendiente: string
  }[]
  excepciones: {
    pedido_id: string
    folio: number
    centro: number
    tipo: string
    usuario: string
    motivo: string
    fecha: string
    monto: string
  }[]
}
export function ControlVentas({
  desde,
  hasta,
}: {
  desde: string
  hasta: string
}) {
  const { api, estado } = useSesion()
  const [todos, setTodos] = useState(false)
  const [reporte, setReporte] = useState<Control | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [buscar, setBuscar] = useState('')
  const consultar = () => {
    setCargando(true)
    setError('')
    void api<Control>(
      `/reportes/control?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&todos=${todos ? '1' : '0'}`,
    )
      .then(setReporte)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No se pudo consultar.'),
      )
      .finally(() => setCargando(false))
  }
  const descargar = () => {
    if (!reporte) return
    const filas: (string | number)[][] = [
      ['Sección', 'Centro', 'Dato', 'Importe Q', 'Usuario', 'Motivo', 'Fecha'],
      [
        'Resumen',
        '',
        'Ventas pagadas',
        reporte.resumen.ventas_pagadas,
        '',
        '',
        `${reporte.desde} / ${reporte.hasta}`,
      ],
      [
        'Resumen',
        '',
        'Pagos recibidos',
        reporte.resumen.pagos_recibidos,
        '',
        '',
        '',
      ],
      [
        'Resumen',
        '',
        'Saldo actual de pedidos del rango',
        reporte.resumen.saldo_pendiente,
        '',
        '',
        '',
      ],
    ]
    for (const c of reporte.por_centro)
      filas.push(['Centro', c.nombre, 'Ventas pagadas', c.ventas, '', '', ''])
    for (const e of reporte.excepciones)
      filas.push([
        e.tipo,
        String(e.centro),
        `Pedido ${e.folio}`,
        e.monto,
        e.usuario,
        e.motivo,
        e.fecha,
      ])
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', convertirCsv(filas)], {
        type: 'text/csv;charset=utf-8',
      }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `control-ventas-${reporte.desde}-${reporte.hasta}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="space-y-4 rounded-2xl border bg-white p-5">
      <h2 className="text-2xl font-bold">Comparación, centros y excepciones</h2>
      <p>
        Usa las fechas seleccionadas arriba. La comparación abarca un período
        anterior de igual duración.
      </p>
      {estado.tipo === 'activa' && estado.usuario.centros.length > 1 && (
        <label className="flex min-h-12 items-center gap-2">
          <input
            type="checkbox"
            checked={todos}
            onChange={(e) => setTodos(e.target.checked)}
          />
          Consolidar todos mis centros autorizados
        </label>
      )}
      <button
        className="min-h-12 rounded-xl bg-teal-700 px-4 text-white disabled:opacity-50"
        disabled={cargando || !desde || !hasta}
        onClick={consultar}
      >
        {cargando ? 'Consultando control…' : 'Consultar control de ventas'}
      </button>
      {error && <p role="alert">{error}</p>}
      {reporte && (
        <>
          <p>
            Control consultado: {reporte.desde} a {reporte.hasta}.
          </p>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ['Ventas de pedidos pagados', reporte.resumen.ventas_pagadas],
              [
                'Pagos recibidos en el período',
                reporte.resumen.pagos_recibidos,
              ],
              [
                'Saldo actual de pedidos del rango',
                reporte.resumen.saldo_pendiente,
              ],
            ].map(([n, v]) => (
              <div className="rounded-xl bg-slate-50 p-4" key={n}>
                <dt>{n}</dt>
                <dd className="text-2xl font-bold">Q {v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-slate-600">
            Ventas se agrupan por fecha de operación del pedido; pagos por fecha
            de operación del cobro. El saldo es el pendiente actual de pedidos
            del rango, no un saldo histórico reconstruido.
          </p>
          <p>
            Período anterior {reporte.comparacion.desde} a{' '}
            {reporte.comparacion.hasta}: Q {reporte.comparacion.ventas},{' '}
            {reporte.comparacion.pedidos} pedidos. Diferencia: Q{' '}
            {reporte.comparacion.diferencia}. Variación:{' '}
            {reporte.comparacion.variacion_porcentaje === null
              ? 'Sin base de comparación'
              : `${reporte.comparacion.variacion_porcentaje}%`}
            .
          </p>
          <div className="overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {[
                    'Centro',
                    'Pedidos pagados',
                    'Ventas Q',
                    'Pagos Q',
                    'Saldo Q',
                  ].map((t) => (
                    <th className="p-2" key={t}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reporte.por_centro.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2">{c.nombre}</td>
                    <td>{c.pedidos}</td>
                    <td>{c.ventas}</td>
                    <td>{c.pagos_recibidos}</td>
                    <td>{c.saldo_pendiente}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="text-xl font-bold">
            Anulaciones, cortesías y descuentos
          </h3>
          <p className="text-sm">
            Excepciones de los pedidos y cobros cuya fecha de operación
            pertenece al rango seleccionado. Cada fila muestra la fecha de la
            acción.
          </p>
          <label>
            Buscar excepción por usuario, motivo o folio
            <input
              className="block min-h-12 w-full rounded-xl border px-3"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
            />
          </label>
          <ul className="max-h-96 space-y-3 overflow-auto">
            {reporte.excepciones
              .filter((e) =>
                `${e.folio} ${e.usuario} ${e.motivo} ${e.tipo}`
                  .toLocaleLowerCase('es')
                  .includes(buscar.toLocaleLowerCase('es')),
              )
              .map((e, i) => (
                <li
                  className="rounded-xl border p-3"
                  key={`${e.pedido_id}-${i}`}
                >
                  <p className="font-semibold">
                    {e.tipo} · Pedido {e.folio} · Q {e.monto}
                  </p>
                  <p>
                    {e.usuario} ·{' '}
                    {new Date(e.fecha).toLocaleString('es-GT', {
                      timeZone: 'America/Guatemala',
                    })}
                  </p>
                  <p>{e.motivo}</p>
                </li>
              ))}
          </ul>
          {!reporte.excepciones.length && (
            <p>No hay excepciones en este rango.</p>
          )}
          <button
            className="min-h-12 rounded-xl border px-4"
            onClick={descargar}
          >
            Descargar control CSV
          </button>
        </>
      )}
    </section>
  )
}
