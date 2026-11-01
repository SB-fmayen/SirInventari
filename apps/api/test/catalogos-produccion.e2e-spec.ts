import { readFile } from 'node:fs/promises';
import { crearBaseAislada } from './base-aislada.js';
describe('Datos iniciales de producción', () => {
  it('carga catálogos sin datos de ejemplo y se puede reenviar sin duplicarlos', async () => {
    const base = await crearBaseAislada({ datosIniciales: false });
    try {
      const sql = await readFile('../../db/03_catalogos_produccion.sql', 'utf8');
      await base.ejecutarSql(sql); await base.ejecutarSql(sql);
      expect(await base.prisma.tipo_venta.count()).toBe(4);
      expect(await base.prisma.metodo_pago.count()).toBe(3);
      expect(await base.prisma.metodo_pago.findUnique({ where: { codigo: 'TARJETA' } })).toMatchObject({ requiere_terminal: true, requiere_referencia: true });
      for (const total of await Promise.all([base.prisma.usuario.count(), base.prisma.centro_venta.count(), base.prisma.producto.count(), base.prisma.turno_caja.count(), base.prisma.pedido.count(), base.prisma.pago.count()])) expect(total).toBe(0);
    } finally { await base.cerrar(); }
  }, 20000);
});
