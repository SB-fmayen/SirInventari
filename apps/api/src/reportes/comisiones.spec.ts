import { Prisma } from '../generated/prisma/client.js';
import { calcularComisiones } from './comisiones.js';

describe('Comisiones de Cubo sobre el cobro diario', () => {
  const pago = (monto: string, fecha = '2026-11-16') => ({ fecha, monto: new Prisma.Decimal(monto) });
  it('aplica IVA a la comisión: Q1,000 dejan Q938.40', () => {
    expect(calcularComisiones([pago('600'), pago('400')]).totales).toEqual({
      cobrado: '1000.00', comision: '55.00', iva: '6.60', descuento: '61.60', neto: '938.40',
    });
  });
  it('suma los cobros antes de redondear, y redondea cada día por separado', () => {
    expect(calcularComisiones([pago('0.10'), pago('0.10')]).totales.neto).toBe('0.19');
    const reporte = calcularComisiones([pago('0.10'), pago('0.10', '2026-11-15')]);
    expect(reporte.totales).toEqual({ cobrado: '0.20', comision: '0.02', iva: '0.00', descuento: '0.02', neto: '0.18' });
    expect(reporte.dias.map(d => d.fecha)).toEqual(['2026-11-15', '2026-11-16']);
  });
  it('redondea medio centavo hacia arriba sin errores binarios', () => {
    expect(calcularComisiones([pago('1.00')]).totales).toEqual({ cobrado: '1.00', comision: '0.06', iva: '0.01', descuento: '0.07', neto: '0.93' });
  });
  it('sin cobros devuelve ceros', () => {
    expect(calcularComisiones([])).toMatchObject({ dias: [], totales: { cobrado: '0.00', comision: '0.00', iva: '0.00', descuento: '0.00', neto: '0.00' } });
  });
});
