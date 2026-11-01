import { BadRequestException } from '@nestjs/common';
import { entero, objeto, uuid } from '../pedidos/validacion-pedido.js';

function monto(valor: unknown): string {
  if ((typeof valor !== 'number' && typeof valor !== 'string') || !/^\d{1,10}(\.\d{1,2})?$/.test(String(valor))) {
    throw new BadRequestException('El monto debe ser un número válido con hasta dos decimales.');
  }
  return String(valor);
}
function voucher(valor: unknown, maximo: number): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || valor.length > maximo) throw new BadRequestException('La terminal o autorización del POS es demasiado larga.');
  return valor.replace(/\s/g, '').toUpperCase() || null;
}
export function nuevoPago(cuerpo: unknown) {
  const c = objeto(cuerpo);
  const importe = monto(c.monto);
  if (Number(importe) <= 0) throw new BadRequestException('El monto del pago debe ser mayor que cero.');
  return { id: uuid(c.id), pedido_id: uuid(c.pedido_id), metodo_pago_id: entero(c.metodo_pago_id), monto: importe,
    recibido: c.recibido === undefined ? importe : monto(c.recibido),
    terminal_pos: voucher(c.terminal_pos, 30), referencia_pos: voucher(c.referencia_pos, 40) };
}
