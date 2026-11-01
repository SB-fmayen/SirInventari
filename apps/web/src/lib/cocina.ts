export type EstadoCocina = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO'
export const nombresCocina: Record<EstadoCocina, string> = {
  PENDIENTE: 'Pendiente', EN_PREPARACION: 'En preparación', LISTO: 'Listo', ENTREGADO: 'Entregado',
}
