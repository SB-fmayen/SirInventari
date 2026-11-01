import { ChartColumn, ChefHat, ClipboardList, Clock, CreditCard, Package, Users } from 'lucide-react'
import type { Rol } from '@/sesion/tipos'

/** Secciones del menú principal y qué roles pueden entrar a cada una. */
export interface Seccion {
  ruta: string
  nombre: string
  descripcion: string
  icono: typeof ClipboardList
  color: string
  tarea: string
  roles: Rol[]
}

// MESERO → Pedidos · COCINA → Cocina · CAJERO → Pedidos, Caja y Turnos
// GERENTE → todo menos Usuarios · ADMIN → todo
export const SECCIONES: Seccion[] = [
  {
    ruta: '/pedidos',
    nombre: 'Pedidos',
    descripcion: 'Tomar pedidos y agregar productos',
    icono: ClipboardList,
    color: 'bg-teal-600',
    tarea: 'Tarea 8',
    roles: ['ADMIN', 'GERENTE', 'CAJERO', 'MESERO'],
  },
  {
    ruta: '/cocina',
    nombre: 'Cocina',
    descripcion: 'Pedidos en preparación en tiempo real',
    icono: ChefHat,
    color: 'bg-orange-500',
    tarea: 'Tarea 9',
    roles: ['ADMIN', 'GERENTE', 'COCINA'],
  },
  {
    ruta: '/caja',
    nombre: 'Caja',
    descripcion: 'Cobrar pedidos y registrar el voucher',
    icono: CreditCard,
    color: 'bg-blue-600',
    tarea: 'Tarea 10',
    roles: ['ADMIN', 'GERENTE', 'CAJERO'],
  },
  {
    ruta: '/turnos',
    nombre: 'Turnos',
    descripcion: 'Abrir y cerrar el turno de caja',
    icono: Clock,
    color: 'bg-violet-600',
    tarea: 'Tarea 7',
    roles: ['ADMIN', 'GERENTE', 'CAJERO'],
  },
  {
    ruta: '/catalogo',
    nombre: 'Catálogo',
    descripcion: 'Categorías, productos y precios',
    icono: Package,
    color: 'bg-amber-600',
    tarea: 'Tarea 6',
    roles: ['ADMIN', 'GERENTE'],
  },
  {
    ruta: '/reportes',
    nombre: 'Reportes',
    descripcion: 'Ventas por tipo, hora y producto',
    icono: ChartColumn,
    color: 'bg-rose-600',
    tarea: 'Tarea 11',
    roles: ['ADMIN', 'GERENTE'],
  },
  {
    ruta: '/usuarios',
    nombre: 'Usuarios',
    descripcion: 'Crear usuarios, roles y centros',
    icono: Users,
    color: 'bg-slate-700',
    tarea: 'Tarea 5',
    roles: ['ADMIN'],
  },
]

export function puedeEntrar(rol: Rol, seccion: Seccion): boolean {
  return seccion.roles.includes(rol)
}

export function seccionesDe(rol: Rol): Seccion[] {
  return SECCIONES.filter((s) => puedeEntrar(rol, s))
}
