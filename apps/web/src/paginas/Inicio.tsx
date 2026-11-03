import { ArrowUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSesion } from '@/sesion/SesionProvider'
import { Autorizaciones } from '@/componentes/AccionControl'
import { Link } from 'react-router'
import type { Seccion } from '@/secciones'

/** Pantalla de inicio: botones grandes para las secciones que el rol puede usar. */
export function Inicio({ secciones }: { secciones: Seccion[] }) {
  const { api, estado, centro } = useSesion()
  const [resumen, setResumen] = useState<{ pendientes?: number; listos?: number; turno?: { id: number } | null; saldo?: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { let activo = true; api<typeof resumen>('/control/resumen').then(r => { if (activo) setResumen(r) }).catch(() => { if (activo) setError('No se pudo consultar el resumen. Puedes usar los módulos.') }); return () => { activo = false } }, [api])
  const rol = estado.tipo === 'activa' ? estado.usuario.rol : ''
  const rapida = rol === 'COCINA' ? '/cocina' : rol === 'CAJERO' ? '/caja' : '/pedidos'
  return (
    <div className="inicio-modulos mx-auto max-w-6xl">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-800">Tu espacio de trabajo</p>
      <h1 className="mb-6 text-3xl font-bold text-slate-900">¿Qué quieres hacer?</h1>
      <p className="mb-4 text-slate-600">Resumen de {centro?.nombre}</p>
      {secciones.some(s => s.ruta === rapida) && <Link className="mb-5 inline-flex min-h-12 items-center rounded-xl bg-teal-700 px-5 font-semibold text-white" to={rapida === '/pedidos' ? '/pedidos?nuevo=1' : rapida}>{rol === 'COCINA' ? 'Ver pendientes de cocina' : rol === 'CAJERO' ? 'Ir a cobrar' : 'Nuevo pedido'}</Link>}
      {resumen && <dl className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Pedidos abiertos',resumen.pendientes],['Listos para entregar',resumen.listos],['Turno de caja',resumen.turno === undefined ? undefined : resumen.turno ? 'Abierto' : 'Cerrado'],['Saldo por cobrar',resumen.saldo === undefined ? undefined : `Q ${resumen.saldo}`]].filter(([,v]) => v !== undefined).map(([t,v]) => <div className="rounded-xl border bg-white p-4" key={t}><dt className="text-sm text-slate-600">{t}</dt><dd className="text-2xl font-bold">{v}</dd></div>)}</dl>}
      {error && <p className="mb-4 text-sm text-slate-600">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secciones.map(({ ruta, nombre, descripcion, icono: Icono, color }) => (
          <Link
            key={ruta}
            to={ruta}
            className="tarjeta-modulo group relative flex min-h-48 flex-col items-start gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition active:scale-[0.98] hover:border-teal-400 hover:shadow-md focus-visible:outline-3 focus-visible:outline-teal-600"
          >
            <span className={`flex size-16 shrink-0 items-center justify-center rounded-2xl text-white ${color}`}>
              <Icono className="size-7" aria-hidden />
            </span>
            <ArrowUpRight className="absolute right-6 top-6 size-5 text-slate-400 transition group-hover:text-teal-700" aria-hidden />
            <span>
              <span className="block text-2xl font-bold text-slate-900">{nombre}</span>
              <span className="block text-base text-slate-600">{descripcion}</span>
            </span>
          </Link>
        ))}
      </div>
      <Autorizaciones />
    </div>
  )
}
