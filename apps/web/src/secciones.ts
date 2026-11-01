import { ChartColumn, ChefHat, ClipboardList, Clock, CreditCard, Package } from 'lucide-react'

/** Secciones del menú principal. */
export interface Seccion {
  ruta: string
  nombre: string
  descripcion: string
  icono: typeof ClipboardList
  color: string
  tarea: string
}

export const SECCIONES: Seccion[] = [
  {
    ruta: '/pedidos',
    nombre: 'Pedidos',
    descripcion: 'Tomar pedidos y agregar productos',
    icono: ClipboardList,
    color: 'bg-teal-600',
    tarea: 'Tarea 8',
  },
  {
    ruta: '/cocina',
    nombre: 'Cocina',
    descripcion: 'Pedidos en preparación en tiempo real',
    icono: ChefHat,
    color: 'bg-orange-500',
    tarea: 'Tarea 9',
  },
  {
    ruta: '/caja',
    nombre: 'Caja',
    descripcion: 'Cobrar pedidos y registrar el voucher',
    icono: CreditCard,
    color: 'bg-blue-600',
    tarea: 'Tarea 10',
  },
  {
    ruta: '/turnos',
    nombre: 'Turnos',
    descripcion: 'Abrir y cerrar el turno de caja',
    icono: Clock,
    color: 'bg-violet-600',
    tarea: 'Tarea 7',
  },
  {
    ruta: '/catalogo',
    nombre: 'Catálogo',
    descripcion: 'Categorías, productos y precios',
    icono: Package,
    color: 'bg-amber-600',
    tarea: 'Tarea 6',
  },
  {
    ruta: '/reportes',
    nombre: 'Reportes',
    descripcion: 'Ventas por tipo, hora y producto',
    icono: ChartColumn,
    color: 'bg-rose-600',
    tarea: 'Tarea 11',
  },
]
