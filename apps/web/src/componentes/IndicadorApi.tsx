import { Database, LoaderCircle, Wifi, WifiOff } from 'lucide-react'
import type { EstadoConexion } from '@/hooks/useSaludApi'
import { cn } from '@/lib/utils'

const TEXTOS: Record<EstadoConexion, { texto: string; detalle: string; clases: string }> = {
  revisando: {
    texto: 'Revisando conexión…',
    detalle: 'Consultando la API',
    clases: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  conectada: {
    texto: 'Conectado',
    detalle: 'La API y la base de datos funcionan',
    clases: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  'sin-base': {
    texto: 'Base de datos sin respuesta',
    detalle: 'La API funciona, pero no se pudo conectar con la base de datos',
    clases: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  'sin-api': {
    texto: 'Sin internet',
    detalle: 'Puedes seguir con el menú y los datos guardados en este dispositivo',
    clases: 'bg-red-100 text-red-800 border-red-300',
  },
}

const ICONOS: Record<EstadoConexion, typeof Wifi> = {
  revisando: LoaderCircle,
  conectada: Wifi,
  'sin-base': Database,
  'sin-api': WifiOff,
}

interface Props {
  estado: EstadoConexion
  onRevisar?: () => void
  className?: string
}

/** Muestra si la app se puede comunicar con la API (GET /salud). Al tocarlo, revisa de nuevo. */
export function IndicadorApi({ estado, onRevisar, className }: Props) {
  const { texto, detalle, clases } = TEXTOS[estado]
  const Icono = ICONOS[estado]
  return (
    <button
      type="button"
      onClick={onRevisar}
      role="status"
      aria-live="polite"
      title={`${detalle}. Toca para revisar de nuevo.`}
      data-estado={estado}
      className={cn(
        'inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-base font-semibold',
        clases,
        className,
      )}
    >
      <Icono className={cn('size-5', estado === 'revisando' && 'animate-spin')} aria-hidden />
      <span>{texto}</span>
    </button>
  )
}
