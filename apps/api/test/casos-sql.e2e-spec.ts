import { crearBaseAislada } from './base-aislada.js';
describe('Los siete casos originales de la base', () => {
  it('ejecuta db/pruebas/casos.sql completo en una base aislada', async () => {
    const base = await crearBaseAislada();
    try {
      const avisos = await base.ejecutarCasos();
      expect(avisos.some((aviso) => aviso.includes('LOS 7 CASOS PASARON'))).toBe(true);
      expect(await base.prisma.pago.count()).toBe(0);
      expect(await base.prisma.pedido.count()).toBe(0);
    } finally { await base.cerrar(); }
  }, 20000);
});
