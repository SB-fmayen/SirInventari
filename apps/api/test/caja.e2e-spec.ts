import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Caja y cobros simultáneos (base aislada)', () => {
  let app: INestApplication;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  const http = () => request(app.getHttpServer());
  const headers = (centro = 1, uid = 'uid-cajero-01') => ({ Authorization: `Bearer ${uid}`, 'X-Centro-Id': String(centro) });
  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base.prisma)
      .overrideProvider(VerificadorFirebase).useValue({ verificar: async (token: string) => ({ uid: token }) }).compile();
    app = modulo.createNestApplication(); await app.init();
    await base.prisma.usuario.create({ data: { firebase_uid: 'caja-admin', nombre: 'Admin pruebas', email: 'admin@prueba.test', rol: 'ADMIN' } });
    await base.prisma.usuario.create({ data: { firebase_uid: 'caja-gerente', nombre: 'Gerente pruebas', email: 'gerente@prueba.test', rol: 'GERENTE', usuario_centro: { create: { centro_venta_id: 1 } } } });
  }, 20000);
  const gerente = () => headers(1, 'caja-gerente');
  afterAll(async () => { try { await app?.close(); } finally { await base?.cerrar(); } });

  async function crearPedido(centro = 1) {
    return (await http().post('/pedidos').set(headers(centro, centro === 1 ? 'uid-cajero-01' : 'caja-admin'))
      .send({ id: randomUUID(), tipo_venta_id: 1, mesa_referencia: 'Mesa prueba', lineas: [{ id: randomUUID(), producto_id: 1, cantidad: 1 }] }).expect(201)).body;
  }
  const efectivo = (pedidoId: string, monto: string | number = 45) => ({ id: randomUUID(), pedido_id: pedidoId, metodo_pago_id: 1, monto });

  it('dos cajas no cobran dos veces el mismo pedido', async () => {
    const pedido = await crearPedido();
    const respuestas = await Promise.all([1, 2].map(() => http().post('/caja/pagos').set(headers()).send(efectivo(pedido.id))));
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await base.prisma.pago.count({ where: { pedido_id: pedido.id } })).toBe(1);
    expect(respuestas.find((r) => r.status === 409)!.body.mensaje).toContain('ya está pagado');
  });

  it('reenviar el mismo UUID, incluso tras el cierre, devuelve el pago sin duplicarlo', async () => {
    const pedido = await crearPedido(); const pago = efectivo(pedido.id);
    const respuestas = await Promise.all([1, 2].map(() => http().post('/caja/pagos').set(headers()).send(pago).expect(201)));
    expect(respuestas[0].body.pago.id).toBe(respuestas[1].body.pago.id);
    expect(await base.prisma.pago.count({ where: { pedido_id: pedido.id } })).toBe(1);
    await http().post('/caja/pagos').set(headers()).send({ ...pago, monto: 44 }).expect(409);
    const turno = await base.prisma.turno_caja.findFirstOrThrow({ where: { centro_venta_id: 1, estado: 'ABIERTO' } });
    await http().post(`/turnos/${turno.id}/cierre`).set(headers()).send({ efectivo_contado: 290 }).expect(201);
    await http().post('/caja/pagos').set(headers()).send(pago).expect(201);
    await http().post('/turnos').set(headers()).send({ fondo_inicial: 0 }).expect(201);
  });

  it('valida el saldo y el efectivo recibido y calcula vuelto y pago dividido', async () => {
    const pedido = await crearPedido();
    await http().post('/caja/pagos').set(headers()).send(efectivo(pedido.id, 46)).expect(409);
    await http().post('/caja/pagos').set(headers()).send({ ...efectivo(pedido.id, 20), recibido: 19 }).expect(400);
    const parcial = await http().post('/caja/pagos').set(headers()).send({ ...efectivo(pedido.id, 20), recibido: 50 }).expect(201);
    expect(parcial.body).toMatchObject({ vuelto: '30.00', comprobante: { pedido: { pagado: '20.00', saldo: '25.00', estado: 'ABIERTO' } } });
    const final = await http().post('/caja/pagos').set(headers()).send({ id: randomUUID(), pedido_id: pedido.id, metodo_pago_id: 2, monto: 25, terminal_pos: 'term-1', referencia_pos: ' 123 456 ' }).expect(201);
    expect(final.body.pago).toMatchObject({ terminal_pos: 'TERM-1', referencia_pos: '123456' });
    expect(final.body.comprobante).toMatchObject({ pedido: { estado: 'PAGADO', pagado: '45.00', saldo: '0.00' } });
    expect(final.body.comprobante.pagos).toHaveLength(2);
    const pendientes = await http().get('/caja/pendientes').set(headers()).expect(200);
    expect(pendientes.body.some((p: { id: string }) => p.id === pedido.id)).toBe(false);
  });

  it('tarjeta exige terminal y voucher; un voucher repetido se bloquea también con espacios', async () => {
    const pedido = await crearPedido();
    const pago = { id: randomUUID(), pedido_id: pedido.id, metodo_pago_id: 2, monto: 45 };
    await http().post('/caja/pagos').set(headers()).send(pago).expect(400);
    await http().post('/caja/pagos').set(headers()).send({ ...pago, terminal_pos: 'TERM-1' }).expect(400);
    const res = await http().post('/caja/pagos').set(headers()).send({ ...pago, terminal_pos: ' term-1 ', referencia_pos: ' 123456' }).expect(409);
    expect(res.body.mensaje).toContain('voucher ya se usó');
    expect(await base.prisma.pago.count({ where: { pedido_id: pedido.id } })).toBe(0);
  });

  it('un mismo voucher simultáneo en centros distintos solo se aplica una vez', async () => {
    await http().post('/turnos').set(headers(2, 'caja-admin')).send({ fondo_inicial: 0 }).expect(201);
    const pedidos = await Promise.all([crearPedido(1), crearPedido(2)]);
    const respuestas = await Promise.all(pedidos.map((p, i) => http().post('/caja/pagos').set(headers(i + 1, i ? 'caja-admin' : 'uid-cajero-01'))
      .send({ id: randomUUID(), pedido_id: p.id, metodo_pago_id: 2, monto: 45, terminal_pos: 'COMPARTIDA', referencia_pos: 'SIMULTANEO' })));
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await base.prisma.pago.count({ where: { referencia_pos: 'SIMULTANEO' } })).toBe(1);
  });

  it('anula con motivo sin borrar productos, conserva autor y admite reintentos sin duplicar la anulación', async () => {
    const p = await crearPedido();
    await http().post(`/pedidos/${p.id}/anulacion`).set(gerente()).send({ motivo: ' ' }).expect(400);
    // Tarea 15: el cajero no anula sin gerente.
    const negado = await http().post(`/pedidos/${p.id}/anulacion`).set(headers()).send({ motivo: 'Cliente canceló' }).expect(403);
    expect(negado.body.mensaje).toMatch(/gerente/);
    await http().post(`/pedidos/${p.id}/anulacion`).set(headers(2, 'caja-admin')).send({ motivo: 'Cliente canceló' }).expect(404);
    const respuestas = await Promise.all([1, 2].map(() => http().post(`/pedidos/${p.id}/anulacion`).set(gerente()).send({ motivo: 'Cliente ya no necesita el pedido' }).expect(201)));
    expect(respuestas[0].body).toMatchObject({ estado: 'ANULADO', total: p.total });
    expect(respuestas[0].body.pedido_detalle).toHaveLength(p.pedido_detalle.length);
    const auditoria = await base.prisma.auditoria.findMany({ where: { tabla: 'pedido', registro_id: p.id, despues: { path: ['motivo_anulacion'], equals: 'Cliente ya no necesita el pedido' } } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].usuario_id).toBe((await base.prisma.usuario.findUniqueOrThrow({ where: { firebase_uid: 'caja-gerente' } })).id);
    await http().post('/caja/pagos').set(headers()).send(efectivo(p.id)).expect(409);
    expect((await http().get('/caja/pendientes').set(headers()).expect(200)).body.some((fila: { id: string }) => fila.id === p.id)).toBe(false);
  });

  it('rechaza anular pedidos con pago parcial o completo y respeta restricciones individuales', async () => {
    const parcial = await crearPedido();
    await http().post('/caja/pagos').set(headers()).send(efectivo(parcial.id, 10)).expect(201);
    await http().post(`/pedidos/${parcial.id}/anulacion`).set(gerente()).send({ motivo: 'Cancelar' }).expect(409);
    const completo = await crearPedido();
    await http().post('/caja/pagos').set(headers()).send(efectivo(completo.id)).expect(201);
    await http().post(`/pedidos/${completo.id}/anulacion`).set(gerente()).send({ motivo: 'Cancelar' }).expect(409);
    const usuario = await base.prisma.usuario.findUniqueOrThrow({ where: { firebase_uid: 'caja-gerente' } });
    await base.prisma.permiso_usuario.create({ data: { usuario_id: usuario.id, modulo: 'pedidos', accion: 'anular', permitido: false } });
    try { await http().post(`/pedidos/${parcial.id}/anulacion`).set(gerente()).send({ motivo: 'Cancelar' }).expect(403); }
    finally { await base.prisma.permiso_usuario.delete({ where: { usuario_id_modulo_accion: { usuario_id: usuario.id, modulo: 'pedidos', accion: 'anular' } } }); }
  });

  it('un cobro y una anulación simultáneos nunca dejan un pedido anulado con dinero aplicado', async () => {
    const p = await crearPedido();
    const resultados = await Promise.all([
      http().post('/caja/pagos').set(headers()).send(efectivo(p.id)),
      http().post(`/pedidos/${p.id}/anulacion`).set(gerente()).send({ motivo: 'Cliente cancela' }),
    ]);
    expect(resultados.map(r => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const final = await base.prisma.pedido.findUniqueOrThrow({ where: { id: p.id } });
    const pagos = await base.prisma.pago.count({ where: { pedido_id: p.id, estado: 'APLICADO' } });
    expect(final.estado === 'ANULADO' ? pagos === 0 : final.estado === 'PAGADO' && pagos === 1).toBe(true);
  });

  it('cierre y cobro simultáneos comparten bloqueo y el cierre cuadra con lo aplicado', async () => {
    const pedido = await crearPedido();
    const turno = await base.prisma.turno_caja.findFirstOrThrow({ where: { centro_venta_id: 1, estado: 'ABIERTO' } });
    const [cobro, cierre] = await Promise.all([
      http().post('/caja/pagos').set(headers()).send(efectivo(pedido.id)),
      http().post(`/turnos/${turno.id}/cierre`).set(headers()).send({ efectivo_contado: 0, motivo_diferencia: 'Conteo de prueba concurrente', confirmar_pendientes: true }),
    ]);
    expect([201, 409]).toContain(cobro.status); expect(cierre.status).toBe(201);
    const suma = await base.prisma.pago.aggregate({ where: { turno_id: turno.id, estado: 'APLICADO', metodo_pago: { codigo: 'EFECTIVO' } }, _sum: { monto: true } });
    expect(Number(cierre.body.efectivo_esperado)).toBe(Number(turno.fondo_inicial) + Number(suma._sum.monto ?? 0));
    const sinTurno = await crearPedido();
    await http().post('/caja/pagos').set(headers()).send(efectivo(sinTurno.id)).expect(409);
  });

  it('bloquea al mesero y evita leer comprobantes de otro centro', async () => {
    const pedido = await crearPedido();
    await http().post('/caja/pagos').set(headers(1, 'uid-mesero-01')).send(efectivo(pedido.id)).expect(403);
    await http().get(`/caja/pedidos/${pedido.id}/comprobante`).set(headers(2, 'caja-admin')).expect(404);
    await http().get('/caja/metodos').set(headers(1, 'uid-mesero-01')).expect(403);
    await http().get('/caja/pendientes').set(headers(1, 'uid-mesero-01')).expect(403);
  });

  it('incluye pedidos pendientes de días anteriores y excluye los anulados', async () => {
    const pedido = await crearPedido();
    await base.prisma.$executeRaw`UPDATE ventas.pedido SET fecha_operacion = ventas.fecha_guatemala() - 1 WHERE id = ${pedido.id}::uuid`;
    expect((await http().get('/caja/pendientes').set(headers()).expect(200)).body.some((p: { id: string }) => p.id === pedido.id)).toBe(true);
    await base.prisma.pedido.update({ where: { id: pedido.id }, data: { estado: 'ANULADO' } });
    expect((await http().get('/caja/pendientes').set(headers()).expect(200)).body.some((p: { id: string }) => p.id === pedido.id)).toBe(false);
  });
});
