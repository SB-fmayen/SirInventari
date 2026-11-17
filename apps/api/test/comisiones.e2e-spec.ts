import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Simulador de comisiones (base aislada)', () => {
  let app: INestApplication;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  let hoy: string, ayer: string, pedidoMixto: string, pedidoParcial: string, pedidoAjeno: string;
  const http = () => request(app.getHttpServer());
  const headers = (centro = 1, uid = 'comisiones-admin') => ({ Authorization: `Bearer ${uid}`, 'X-Centro-Id': String(centro) });
  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base.prisma)
      .overrideProvider(VerificadorFirebase).useValue({ verificar: async (uid: string) => ({ uid }) }).compile();
    app = modulo.createNestApplication(); await app.init();
    const admin = await base.prisma.usuario.create({ data: { firebase_uid: 'comisiones-admin', nombre: 'Admin comisiones', email: 'comisiones@prueba.test', rol: 'ADMIN' } });
    const gerente = await base.prisma.usuario.create({ data: { firebase_uid: 'comisiones-gerente', nombre: 'Gerente centro 1', email: 'gerente@prueba.test', rol: 'GERENTE', usuario_centro: { create: { centro_venta_id: 1 } } } });
    expect(gerente.id).toBeGreaterThan(0);
    const [fechas] = await base.prisma.$queryRaw<{ hoy: string; ayer: string }[]>`SELECT ventas.fecha_guatemala()::text AS hoy, (ventas.fecha_guatemala() - 1)::text AS ayer`;
    hoy = fechas.hoy; ayer = fechas.ayer;
    const turno2 = await base.prisma.turno_caja.create({ data: { centro_venta_id: 2, abierto_por: admin.id, fondo_inicial: 0 } });
    async function pedido(centro = 1, dia = hoy, precio = '2000.00') {
      const fecha = new Date(`${dia}T00:00:00Z`);
      const [folio] = await base.prisma.$queryRaw<{ numero: number }[]>`SELECT ventas.siguiente_folio(${centro}::smallint, ${fecha}::date) AS numero`;
      const p = await base.prisma.pedido.create({ data: { id: randomUUID(), centro_venta_id: centro, fecha_operacion: fecha, folio: folio.numero, tipo_venta_id: 2, cliente_nombre: 'Cliente prueba', creado_por: admin.id } });
      await base.prisma.pedido_detalle.create({ data: { id: randomUUID(), pedido_id: p.id, producto_id: 1, cantidad: 1, precio_unitario: precio, agregado_por: admin.id } });
      return p.id;
    }
    async function cobrar(id: string, monto: string, metodo = 2, terminal = 'CUBO1', dia = hoy, turno = 1) {
      return base.prisma.pago.create({ data: {
        id: randomUUID(), pedido_id: id, monto, metodo_pago_id: metodo, turno_id: turno,
        terminal_pos: metodo === 2 ? terminal : null, referencia_pos: metodo === 1 ? null : randomUUID(),
        registrado_por: admin.id, fecha_operacion: new Date(`${dia}T00:00:00Z`),
        // Medianoche UTC aún pertenece al día anterior en Guatemala.
        registrado_en: new Date(`${dia}T23:59:00-06:00`),
      } });
    }
    pedidoMixto = await pedido(1, hoy, '1500.00');
    await cobrar(pedidoMixto, '500', 1);
    await cobrar(pedidoMixto, '600');
    await cobrar(pedidoMixto, '400', 2, 'CUBO2');
    pedidoParcial = await pedido(1, ayer);
    await cobrar(pedidoParcial, '10');
    await cobrar(pedidoParcial, '5', 3);
    await cobrar(pedidoParcial, '0.10', 2, 'CUBO1', ayer);
    const anulado = await cobrar(pedidoParcial, '7');
    await base.prisma.pago.update({ where: { id: anulado.id }, data: { estado: 'ANULADO', motivo_anulacion: 'Prueba', anulado_por: admin.id, anulado_en: new Date() } });
    // Papelera conserva los cobros reales.
    await base.prisma.pedido.update({ where: { id: pedidoMixto }, data: { eliminado_en: new Date(), eliminado_por: admin.id, motivo_eliminacion: 'Prueba' } });
    pedidoAjeno = await pedido(2);
    await cobrar(pedidoAjeno, '900', 2, 'OTROCENTRO', hoy, turno2.id);
  }, 30000);
  afterAll(async () => { try { await app?.close(); } finally { await base?.cerrar(); } });

  it('cuenta solo tarjeta aplicada por fecha del cobro, con abonos y papelera', async () => {
    const r = await http().get('/reportes/comisiones').set(headers()).expect(200);
    expect(r.body).toMatchObject({ desde: hoy, hasta: hoy, total_cobros: 3, total_pedidos: 2,
      totales: { cobrado: '1010.00', comision: '55.55', iva: '6.67', descuento: '62.22', neto: '947.78' } });
    expect(r.body.pedidos.find((p: { id: string }) => p.id === pedidoMixto).en_papelera).toBe(true);
    expect(r.body.cobros.find((p: { pedido_id: string }) => p.pedido_id === pedidoParcial)).toMatchObject({ fecha_pedido: ayer, fecha: hoy, monto: '10.00' });
    expect(r.body.cobros.every((p: { terminal: string; autorizacion: string }) => p.terminal && p.autorizacion)).toBe(true);
  });
  it('filtra pedidos y terminal normalizada sin duplicar cobros', async () => {
    const r = await http().get('/reportes/comisiones').query({ pedidos: `${pedidoMixto},${pedidoMixto}` }).set(headers()).expect(200);
    expect(r.body).toMatchObject({ total_pedidos: 1, total_cobros: 2, totales: { cobrado: '1000.00', comision: '55.00', iva: '6.60', descuento: '61.60', neto: '938.40' } });
    expect(r.body.pedidos).toHaveLength(2);
    const terminal = await http().get('/reportes/comisiones').query({ terminal: ' cubo 1 ' }).set(headers()).expect(200);
    expect(terminal.body).toMatchObject({ terminal: 'CUBO1', total_cobros: 2, totales: { cobrado: '610.00', neto: '572.42' } });
    const vacio = await http().get('/reportes/comisiones?terminal=NOEXISTE').set(headers()).expect(200);
    expect(vacio.body).toMatchObject({ total_cobros: 0, pedidos: [], dias: [], totales: { neto: '0.00' } });
  });
  it('suma los resultados diarios del rango sin mover cobros por la hora UTC', async () => {
    const r = await http().get('/reportes/comisiones').query({ desde: ayer, hasta: hoy }).set(headers()).expect(200);
    expect(r.body.dias).toEqual([
      { fecha: ayer, cobrado: '0.10', comision: '0.01', iva: '0.00', descuento: '0.01', neto: '0.09' },
      { fecha: hoy, cobrado: '1010.00', comision: '55.55', iva: '6.67', descuento: '62.22', neto: '947.78' },
    ]);
    expect(r.body.totales.neto).toBe('947.87');
  });
  it('respeta roles y centros incluso si se pasa el ID de un pedido ajeno', async () => {
    const r = await http().get('/reportes/comisiones').query({ pedidos: pedidoAjeno }).set(headers(1, 'comisiones-gerente')).expect(200);
    expect(r.body).toMatchObject({ total_cobros: 0, cobros: [], totales: { cobrado: '0.00' } });
    expect(r.body.pedidos.some((p: { id: string }) => p.id === pedidoAjeno)).toBe(false);
    await http().get('/reportes/comisiones').set(headers(2, 'comisiones-gerente')).expect(403);
    for (const uid of ['uid-cajero-01', 'uid-mesero-01']) await http().get('/reportes/comisiones').set(headers(1, uid)).expect(403);
  });
  it('rechaza fechas, terminales y selecciones inválidas', async () => {
    for (const query of [
      { desde: '2026-02-30' }, { desde: '2026-12-01', hasta: '2026-01-01' },
      { desde: '2020-01-01', hasta: hoy }, { terminal: 'x'.repeat(31) }, { pedidos: 'incorrecto' },
      { pedidos: '' }, { pedidos: Array(101).fill(pedidoMixto).join(',') },
    ]) await http().get('/reportes/comisiones').query(query).set(headers()).expect(400);
  });
});
