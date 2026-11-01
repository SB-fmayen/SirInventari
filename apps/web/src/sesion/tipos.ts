export type Rol = 'ADMIN' | 'GERENTE' | 'CAJERO' | 'MESERO' | 'COCINA'

export interface CentroVenta {
  id: number
  codigo: string
  nombre: string
}

/** Lo que responde GET /sesion. */
export interface UsuarioSistema {
  id: number
  nombre: string
  email: string
  rol: Rol
  centros: CentroVenta[]
}

export type EstadoSesion =
  | { tipo: 'cargando' }
  | { tipo: 'sin-sesion' }
  | { tipo: 'sin-acceso'; mensaje: string }
  | { tipo: 'activa'; usuario: UsuarioSistema }

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  GERENTE: 'Gerente',
  CAJERO: 'Cajero',
  MESERO: 'Mesero',
  COCINA: 'Cocina',
}
