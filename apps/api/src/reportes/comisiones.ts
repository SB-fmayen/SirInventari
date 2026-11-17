import { Prisma } from '../generated/prisma/client.js';

/** Tarifa solicitada por el negocio; el IVA se aplica a la comisión de cada día. */
export function calcularComisiones(pagos: { fecha: string; monto: Prisma.Decimal }[]) {
  const porDia = new Map<string, Prisma.Decimal>();
  for (const pago of pagos)
    porDia.set(pago.fecha, (porDia.get(pago.fecha) ?? new Prisma.Decimal(0)).plus(pago.monto));

  const dias = [...porDia].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, cobrado]) => {
    const comision = cobrado.times('0.055').toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const iva = comision.times('0.12').toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const descuento = comision.plus(iva);
    return {
      fecha, cobrado: cobrado.toFixed(2), comision: comision.toFixed(2),
      iva: iva.toFixed(2), descuento: descuento.toFixed(2), neto: cobrado.minus(descuento).toFixed(2),
    };
  });
  const sumar = (campo: 'cobrado' | 'comision' | 'iva' | 'descuento' | 'neto') =>
    dias.reduce((suma, dia) => suma.plus(dia[campo]), new Prisma.Decimal(0)).toFixed(2);
  return {
    porcentaje_comision: '5.50', porcentaje_iva: '12.00', dias,
    totales: { cobrado: sumar('cobrado'), comision: sumar('comision'), iva: sumar('iva'), descuento: sumar('descuento'), neto: sumar('neto') },
  };
}
