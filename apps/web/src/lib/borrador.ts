export interface BorradorGuardado { id: string; tipo_venta_id: string; mesa_referencia: string; cliente_nombre: string; cliente_telefono?: string; cliente_direccion?: string; cliente_id?: string | null; cliente_version?: number | null; actualizar_cliente?: boolean; lineas: { id:string; producto_id:number; cantidad:string; notas:string }[] }
export function leerBorrador(clave: string): BorradorGuardado | null {
  try {
    const b = JSON.parse(localStorage.getItem(clave) ?? 'null') as BorradorGuardado | null
    if (!b || typeof b.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.id) || typeof b.tipo_venta_id !== 'string' || typeof b.mesa_referencia !== 'string' || typeof b.cliente_nombre !== 'string' || !Array.isArray(b.lineas) || b.lineas.length > 200) return null
    if (!b.lineas.every(l => l && typeof l.id === 'string' && /^[0-9a-f-]{36}$/i.test(l.id) && Number.isInteger(l.producto_id) && l.producto_id > 0 && typeof l.cantidad === 'string' && typeof l.notas === 'string' && l.notas.length <= 200)) return null
    if ((b.cliente_telefono !== undefined && (typeof b.cliente_telefono !== 'string' || b.cliente_telefono.length > 30)) || (b.cliente_direccion !== undefined && (typeof b.cliente_direccion !== 'string' || b.cliente_direccion.length > 300)) || (b.cliente_id != null && (typeof b.cliente_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.cliente_id))) || (b.cliente_version != null && (!Number.isSafeInteger(b.cliente_version) || b.cliente_version < 1)) || (b.actualizar_cliente !== undefined && typeof b.actualizar_cliente !== 'boolean')) return null
    return b
  } catch { return null }
}
