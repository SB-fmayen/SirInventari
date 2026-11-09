import { BadRequestException } from '@nestjs/common';

export function uuid(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) {
    throw new BadRequestException('El identificador del pedido o producto no es válido.');
  }
  return valor.toLowerCase();
}
export function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new BadRequestException('Faltan los datos del pedido.');
  return valor as Record<string, unknown>;
}
export function texto(valor: unknown, maximo: number): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || valor.trim().length > maximo) throw new BadRequestException(`El texto debe tener hasta ${maximo} caracteres.`);
  return valor.trim() || null;
}
export function entero(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > 2147483647) throw new BadRequestException('El tipo de venta o producto no es válido.');
  return valor;
}
export function lineas(cuerpo: unknown) {
  const valor = objeto(cuerpo).lineas;
  if (!Array.isArray(valor) || !valor.length || valor.length > 200) throw new BadRequestException('Agrega entre 1 y 200 productos al pedido.');
  const resultado = valor.map((v: unknown) => {
    const c = objeto(v);
    if ((typeof c.cantidad !== 'number' && typeof c.cantidad !== 'string') || !/^\d{1,6}(\.\d{1,2})?$/.test(String(c.cantidad)) || Number(c.cantidad) <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor que cero, con hasta dos decimales.');
    }
    return { id: uuid(c.id), producto_id: entero(c.producto_id), cantidad: String(c.cantidad), notas: texto(c.notas, 200) };
  });
  if (new Set(resultado.map((l) => l.id)).size !== resultado.length) throw new BadRequestException('Los identificadores de los productos no se pueden repetir.');
  return resultado;
}
export function nuevoPedido(cuerpo: unknown) {
  const c = objeto(cuerpo);
  return { id: uuid(c.id), tipo_venta_id: entero(c.tipo_venta_id), mesa_referencia: texto(c.mesa_referencia, 30), cliente_nombre: texto(c.cliente_nombre, 100), cliente_id: c.cliente_id ? uuid(c.cliente_id) : null, cliente_telefono: texto(c.cliente_telefono, 30), cliente_direccion: texto(c.cliente_direccion, 300), cliente_version: c.cliente_version === undefined || c.cliente_version === null ? null : entero(c.cliente_version), actualizar_cliente: c.actualizar_cliente === true, lineas: lineas(c) };
}
