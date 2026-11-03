import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Mejoras aprobadas: controles y permisos', () => {
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  let app: INestApplication; let p: PrismaService; let admin: number; let cajero: number;
  const token = randomUUID(); const caja = randomUUID();
  const http = () => request(app.getHttpServer());
  const h = (u = token, centro = 1) => ({ Authorization: `Bearer ${u}`, 'X-Centro-Id': String(centro) });
  beforeAll(async () => {
    base = await crearBaseAislada(); p = base.prisma;
    admin = (await p.usuario.create({ data: { firebase_uid: token, email: `${token}@test.com`, nombre: 'Admin mejoras', rol: 'ADMIN' } })).id;
    cajero = (await p.usuario.create({ data: { firebase_uid: caja, email: `${caja}@test.com`, nombre: 'Caja mejoras', rol: 'CAJERO', usuario_centro: { create: { centro_venta_id: 1 } } } })).id;
    const m = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(p).overrideProvider(VerificadorFirebase).useValue({ verificar: async (uid: string) => ({ uid }) }).compile();
    app = m.createNestApplication(); await app.init();
  });
  afterAll(async () => { try { await app?.close(); } finally { await base?.cerrar(); } });

  it('dos cambios concurrentes de rol conservan un administrador activo', async () => {
    const otros = await p.usuario.findMany({ where: { rol: 'ADMIN', activo: true, id: { not: admin } } });
    for (const u of otros) await p.usuario.update({ where: { id: u.id }, data: { activo: false } });
    const segundo = await p.usuario.create({ data: { firebase_uid: randomUUID(), email: `${randomUUID()}@test.com`, nombre: 'Segundo admin', rol: 'ADMIN' } });
    const rs = await Promise.all([admin,segundo.id].map(id => http().patch(`/usuarios/${id}`).set(h()).send({ rol: 'GERENTE', centros: [1] })));
    expect(rs.map(r => r.status).sort()).toEqual([200,409]);
    expect(await p.usuario.count({ where: { rol: 'ADMIN', activo: true } })).toBe(1);
    await p.usuario.update({ where: { id: admin }, data: { rol: 'ADMIN', activo: true } });
  });

  it('el permiso específico bloquea la API y no concede módulos fuera del rol', async () => {
    await http().patch(`/control/permisos/${cajero}`).set(h()).send({ permisos: [{ modulo: 'caja', accion: 'crear', permitido: false }, { modulo: 'usuarios', accion: 'ver', permitido: true }] }).expect(200);
    await http().post('/caja/pagos').set(h(caja)).send({}).expect(403);
    await http().get('/usuarios').set(h(caja)).expect(403);
    await http().get('/caja/pendientes').set(h(caja)).expect(200);
    await http().get('/caja/pendientes').set(h(caja, 2)).expect(403);
    await http().patch(`/control/permisos/${cajero}`).set(h()).send({ permisos: [] }).expect(200);
  });

  it('cortesía requiere autorización y se reintenta sin duplicar ni crear pagos cero', async () => {
    const pedido = await http().post('/pedidos').set(h(caja)).send({ id: randomUUID(), tipo_venta_id: 1, mesa_referencia: 'Prueba', lineas: [{ id: randomUUID(), producto_id: 1, cantidad: '1' }] }).expect(201);
    const solicitud = { id: randomUUID(), pedido_id: pedido.body.id, tipo: 'CORTESIA', motivo: 'Atención al cliente' };
    const s = await http().post('/control/solicitudes').set(h(caja)).send(solicitud).expect(201);
    await http().post(`/control/solicitudes/${s.body.id}/resolver`).set(h(caja)).send({ aprobar: true }).expect(403);
    await http().post(`/control/solicitudes/${s.body.id}/resolver`).set(h()).send({ aprobar: true }).expect(201);
    await http().post(`/control/solicitudes/${s.body.id}/resolver`).set(h()).send({ aprobar: true }).expect(201);
    const final = await p.pedido.findUniqueOrThrow({ where: { id: pedido.body.id } });
    expect(final.estado).toBe('PAGADO'); expect(final.total.toString()).toBe('0'); expect(final.cortesia_por).toBe(admin);
    expect(await p.pago.count({ where: { pedido_id: final.id } })).toBe(0);
    expect(await p.solicitud_autorizacion.count({ where: { pedido_id: final.id } })).toBe(1);
    await http().delete('/control/productos/1').set(h()).expect(409);
  });

  it('elimina solo usuarios desactivados sin historial y rechaza eliminarse a sí mismo', async () => {
    const u = await p.usuario.create({ data: { firebase_uid: randomUUID(), email: `${randomUUID()}@test.com`, nombre: 'Error de registro', rol: 'MESERO', activo: false } });
    await http().delete(`/control/usuarios/${u.id}`).set(h()).expect(200);
    expect(await p.usuario.findUnique({ where: { id: u.id } })).toBeNull();
    await http().delete(`/control/usuarios/${admin}`).set(h()).expect(409);
    await http().delete(`/control/usuarios/${cajero}`).set(h()).expect(409);
  });
});
