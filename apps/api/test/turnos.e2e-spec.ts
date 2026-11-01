import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TurnosService } from '../src/turnos/turnos.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';

describe('Turnos de caja (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuarioId: number;
  let centroId: number;
  let turnoId: number;
  const uid = `turnos-${randomUUID()}`;
  const http = () => request(app.getHttpServer());
  const headers = () => ({ Authorization: `Bearer ${uid}`, 'X-Centro-Id': String(centroId) });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VerificadorFirebase).useValue({ verificar: async (token: string) => ({ uid: token }) }).compile();
    app = modulo.createNestApplication(); await app.init(); prisma = app.get(PrismaService);
    centroId = (await prisma.centro_venta.create({ data: { codigo: `T${randomUUID().slice(0, 8)}`, nombre: 'Centro prueba turnos' } })).id;
    usuarioId = (await prisma.usuario.create({ data: { firebase_uid: uid, email: `${uid}@prueba.test`, nombre: 'Cajera prueba', rol: 'CAJERO', usuario_centro: { create: { centro_venta_id: centroId } } } })).id;
  });

  afterAll(async () => {
    if (centroId) await prisma.turno_caja.deleteMany({ where: { centro_venta_id: centroId } });
    if (usuarioId) { await prisma.usuario_centro.deleteMany({ where: { usuario_id: usuarioId } }); await prisma.usuario.delete({ where: { id: usuarioId } }); }
    if (centroId) await prisma.centro_venta.delete({ where: { id: centroId } });
    await app.close();
  });

  it('dos aperturas simultáneas dejan un solo turno e informan quién lo abrió', async () => {
    const respuestas = await Promise.all([1, 2].map(() => http().post('/turnos').set(headers()).send({ fondo_inicial: '100.10' })));
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    turnoId = respuestas.find((r) => r.status === 201)!.body.id;
    expect(respuestas.find((r) => r.status === 409)!.body.mensaje).toContain('Cajera prueba');
    const lista = await http().get('/turnos').set(headers()).expect(200);
    const fecha = (await prisma.$queryRaw<{ fecha: string }[]>`SELECT ventas.fecha_guatemala()::text AS fecha`)[0].fecha;
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0]).toMatchObject({ fecha_operacion: fecha, efectivo_esperado: '100.10', nombre_apertura: 'Cajera prueba' });
  });

  it('cierra una vez, calcula la diferencia y conserva historial al abrir otro', async () => {
    const res = await http().post(`/turnos/${turnoId}/cierre`).set(headers()).send({ efectivo_contado: '99.10' }).expect(201);
    expect(res.body).toMatchObject({ estado: 'CERRADO', efectivo_esperado: '100.10', diferencia: '-1.00', nombre_cierre: 'Cajera prueba' });
    await http().post(`/turnos/${turnoId}/cierre`).set(headers()).send({ efectivo_contado: 0 }).expect(409);
    await http().post('/turnos').set(headers()).send({ fondo_inicial: 0 }).expect(201);
    expect((await http().get('/turnos').set(headers()).expect(200)).body).toHaveLength(2);
    await prisma.turno_caja.deleteMany({ where: { centro_venta_id: centroId, estado: 'ABIERTO' } });
  });

  it('suma solo efectivo aplicado, ignora tarjeta y pagos anulados (sin dejar ventas)', async () => {
    const deshacer = new Error('Deshacer prueba de efectivo');
    await expect(prisma.$transaction(async (tx) => {
      const t = await tx.turno_caja.create({ data: { centro_venta_id: centroId, abierto_por: usuarioId, fondo_inicial: '100.10' } });
      const pedido = await tx.pedido.create({ data: { id: randomUUID(), centro_venta_id: centroId, folio: 1, tipo_venta_id: 1, turno_id: t.id, creado_por: usuarioId } });
      await tx.pedido_detalle.create({ data: { id: randomUUID(), pedido_id: pedido.id, producto_id: 1, cantidad: 1, precio_unitario: 45, agregado_por: usuarioId } });
      const pago = await tx.pago.create({ data: { id: randomUUID(), pedido_id: pedido.id, metodo_pago_id: 1, turno_id: t.id, monto: 5, registrado_por: usuarioId } });
      await tx.pago.update({ where: { id: pago.id }, data: { estado: 'ANULADO', anulado_por: usuarioId, motivo_anulacion: 'Prueba de anulación' } });
      await tx.pago.create({ data: { id: randomUUID(), pedido_id: pedido.id, metodo_pago_id: 1, turno_id: t.id, monto: '20.20', registrado_por: usuarioId } });
      await tx.pago.create({ data: { id: randomUUID(), pedido_id: pedido.id, metodo_pago_id: 2, turno_id: t.id, monto: '24.80', registrado_por: usuarioId, terminal_pos: 'PRUEBA', referencia_pos: randomUUID() } });
      // El servicio usa la transacción real de la prueba para que todos los datos se deshagan.
      const servicio = new TurnosService({ $transaction: (operacion: (conexion: Prisma.TransactionClient) => Promise<unknown>) => operacion(tx) } as unknown as PrismaService);
      const cierre = await servicio.cerrar(centroId, usuarioId, t.id, '120.20');
      expect(cierre).toMatchObject({ efectivo_ventas: '20.20', efectivo_esperado: '120.30', diferencia: '-0.10' });
      throw deshacer;
    })).rejects.toBe(deshacer);
  });

  it('valida montos, rol y centro para consultar y cerrar', async () => {
    await http().post('/turnos').set(headers()).send({ fondo_inicial: -1 }).expect(400);
    await http().get('/turnos').set({ Authorization: `Bearer ${uid}`, 'X-Centro-Id': '1' }).expect(403);
    await http().post('/turnos/1/cierre').set(headers()).send({ efectivo_contado: 0 }).expect(404);
    await prisma.usuario.update({ where: { id: usuarioId }, data: { rol: 'MESERO' } });
    await http().get('/turnos').set(headers()).expect(403);
    await http().post('/turnos').set(headers()).send({ fondo_inicial: 0 }).expect(403);
  });
});
