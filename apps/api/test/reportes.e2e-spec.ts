import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Reportes de ventas e historial (base aislada)', () => {
  let app: INestApplication;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  let hoy: string;
  let pedidoId: string;
  const http = () => request(app.getHttpServer());
  const headers = (centro = 1, uid = 'reportes-admin') => ({ Authorization: `Bearer ${uid}`, 'X-Centro-Id': String(centro) });
  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base.prisma)
      .overrideProvider(VerificadorFirebase).useValue({ verificar: async (token: string) => ({ uid: token }) }).compile();
    app = modulo.createNestApplication(); await app.init();
    const admin = await base.prisma.usuario.create({ data: { firebase_uid: 'reportes-admin', nombre: 'Admin reportes', email: 'reportes@prueba.test', rol: 'ADMIN' } });
    hoy = (await base.prisma.$queryRaw<{ fecha: string }[]>`SELECT ventas.fecha_guatemala()::text AS fecha`)[0].fecha;
    // Venta completa de Q45 dividida en efectivo y tarjeta.
    const p = await http().post('/pedidos').set(headers()).send({ id: randomUUID(), tipo_venta_id: 1, mesa_referencia: 'Mesa 4', lineas: [{ id: randomUUID(), producto_id: 1, cantidad: 1 }] }).expect(201);
    pedidoId = p.body.id;
    await http().post('/caja/pagos').set(headers()).send({ id: randomUUID(), pedido_id: pedidoId, metodo_pago_id: 1, monto: 20 }).expect(201);
    await http().post('/caja/pagos').set(headers()).send({ id: randomUUID(), pedido_id: pedidoId, metodo_pago_id: 2, monto: 25, terminal_pos: 'REPORTES', referencia_pos: 'R1' }).expect(201);
    // Venta de tres productos de un centavo con descuento de dos centavos: neto Q0.01.
    const [folio] = await base.prisma.$queryRaw<{ numero: number }[]>`SELECT ventas.siguiente_folio(1::smallint, ventas.fecha_guatemala()) AS numero`;
    const p2 = await base.prisma.pedido.create({ data: { id: randomUUID(), centro_venta_id: 1, folio: folio.numero, tipo_venta_id: 2, cliente_nombre: 'Prueba centavos', creado_por: admin.id } });
    for (let i = 0; i < 3; i++) await base.prisma.pedido_detalle.create({ data: { id: randomUUID(), pedido_id: p2.id, producto_id: i ? 2 : 1, cantidad: 1, precio_unitario: '0.01', agregado_por: admin.id } });
    await base.prisma.pedido.update({ where: { id: p2.id }, data: { descuento: '0.02' } });
    await http().post('/caja/pagos').set(headers()).send({ id: randomUUID(), pedido_id: p2.id, metodo_pago_id: 1, monto: '0.01' }).expect(201);
    // Pedido con pago parcial: no debe inflar las ventas de pedidos ya cobrados.
    const p3 = await http().post('/pedidos').set(headers()).send({ id: randomUUID(), tipo_venta_id: 1, mesa_referencia: 'Mesa pendiente', lineas: [{ id: randomUUID(), producto_id: 1, cantidad: 1 }] }).expect(201);
    await http().post('/caja/pagos').set(headers()).send({ id: randomUUID(), pedido_id: p3.body.id, metodo_pago_id: 1, monto: 5 }).expect(201);
  }, 20000);
  afterAll(async () => { try { await app?.close(); } finally { await base?.cerrar(); } });

  it('los totales por tipo, hora, producto y forma de pago cuadran con los pedidos pagados', async () => {
    const r = await http().get(`/reportes/ventas?desde=${hoy}&hasta=${hoy}`).set(headers()).expect(200);
    expect(r.body.resumen).toEqual({ total_pedidos: 2, total_vendido: '45.01', ticket_promedio: '22.51', descuentos: '0.02' });
    for (const clave of ['por_tipo', 'por_hora', 'por_producto', 'por_pago']) {
      const centavos = r.body[clave].reduce((suma: number, f: { total: string }) => suma + Math.round(Number(f.total) * 100), 0);
      expect(centavos).toBe(4501);
      expect(r.body[clave].every((f: { total: string }) => Number(f.total) >= 0)).toBe(true);
    }
    expect(r.body.pedidos).toHaveLength(2);
    const horaEsperada = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
    expect(r.body.por_hora[0].nombre).toBe(`${horaEsperada}:00`);
  });

  it('filtra por centro y valida fechas reales y rangos', async () => {
    expect((await http().get('/reportes/ventas').set(headers(2)).expect(200)).body.resumen.total_vendido).toBe('0.00');
    for (const rango of ['desde=2026-02-30', 'desde=2027-01-01&hasta=2026-01-01', 'desde=2020-01-01&hasta=2026-01-01']) {
      await http().get(`/reportes/ventas?${rango}`).set(headers()).expect(400);
    }
  });

  it('el historial explica quién tomó, agregó y cobró; no cruza centros ni roles', async () => {
    const r = await http().get(`/reportes/pedidos/${pedidoId}/historial`).set(headers()).expect(200);
    expect(r.body.eventos.map((e: { descripcion: string }) => e.descripcion).join(' ')).toContain('Registró Q 25.00');
    expect(r.body.eventos.every((e: { usuario: string }) => e.usuario === 'Admin reportes')).toBe(true);
    expect(r.body.eventos.some((e: { descripcion: string }) => e.descripcion.includes('Plato del día'))).toBe(true);
    await http().get(`/reportes/pedidos/${pedidoId}/historial`).set(headers(2)).expect(404);
    await http().get('/reportes/ventas').set(headers(1, 'uid-cajero-01')).expect(403);
    await http().get(`/reportes/pedidos/${pedidoId}/historial`).set(headers(1, 'uid-mesero-01')).expect(403);
  });
});
