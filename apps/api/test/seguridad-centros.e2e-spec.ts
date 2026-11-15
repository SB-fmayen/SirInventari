import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { contextoBd } from '../src/prisma/contexto-bd.js';
import { crearBaseAislada } from './base-aislada.js';

// Tarea 16: Row Level Security por centro y auditoría explicada en palabras.
describe('Seguridad por centro y auditoría (base aislada)', () => {
  let app: INestApplication;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  const http = () => request(app.getHttpServer());
  const headers = (uid: string, centro = 1) => ({ Authorization: `Bearer ${uid}`, 'X-Centro-Id': String(centro) });
  let ajeno: string;
  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base.prisma)
      .overrideProvider(VerificadorFirebase).useValue({ verificar: async (token: string) => ({ uid: token }) }).compile();
    app = modulo.createNestApplication(); await app.init();
    await base.prisma.usuario.create({ data: { firebase_uid: 'seg-admin', nombre: 'Admin seguridad', email: 'seg@prueba.test', rol: 'ADMIN' } });
    await base.prisma.usuario.create({ data: { firebase_uid: 'seg-gerente', nombre: 'Gerente seguridad', email: 'seg-g@prueba.test', rol: 'GERENTE', usuario_centro: { create: { centro_venta_id: 1 } } } });
    ajeno = (await http().post('/pedidos').set(headers('seg-admin', 2)).send({ id: randomUUID(), tipo_venta_id: 2, cliente_nombre: 'Cliente del centro 2', lineas: [{ id: randomUUID(), producto_id: 1, cantidad: 1 }] }).expect(201)).body.id;
  }, 20000);
  afterAll(async () => { try { await app?.close(); } finally { await base?.cerrar(); } });

  it('la base misma oculta y protege los pedidos de otros centros', async () => {
    const solo1 = { usuarioId: 1, centros: [1] };
    const [rol] = await contextoBd.run(solo1, async () => await base.prisma.$queryRaw<{ rol: string }[]>`SELECT current_user::text AS rol`);
    expect(rol.rol).toBe('ventas_api');
    expect(await contextoBd.run(solo1, async () => await base.prisma.pedido.findUnique({ where: { id: ajeno } }))).toBeNull();
    expect(await contextoBd.run(solo1, async () => await base.prisma.pedido_detalle.count({ where: { pedido_id: ajeno } }))).toBe(0);
    const cambio = await contextoBd.run(solo1, async () => await base.prisma.pedido.updateMany({ where: { id: ajeno }, data: { cliente_nombre: 'Intruso' } }));
    expect(cambio.count).toBe(0);
    expect(await contextoBd.run({ usuarioId: 1, centros: [2] }, async () => await base.prisma.pedido.findUnique({ where: { id: ajeno } }))).not.toBeNull();
    expect(await contextoBd.run({ centros: [] }, async () => await base.prisma.pedido.count())).toBe(0);
    // Fuera de una petición (scripts) se usa el usuario normal y la conexión queda limpia.
    const [normal] = await base.prisma.$queryRaw<{ rol: string; centros: string }[]>`SELECT current_user::text AS rol, current_setting('app.centros', true) AS centros`;
    expect(normal.rol).not.toBe('ventas_api');
    expect(normal.centros).toBe('');
    expect((await base.prisma.pedido.findUniqueOrThrow({ where: { id: ajeno } })).cliente_nombre).toBe('Cliente del centro 2');
  });

  it('un usuario del centro 1 no ve el pedido del centro 2 por la API', async () => {
    await http().get(`/pedidos/${ajeno}`).set(headers('uid-cajero-01')).expect(404);
    await http().get(`/pedidos/${ajeno}`).set(headers('uid-cajero-01', 2)).expect(403);
  });

  it('la auditoría muestra quién creó, agregó y cobró un pedido, explicado en palabras', async () => {
    const id = randomUUID();
    await http().post('/pedidos').set(headers('uid-cajero-01')).send({ id, tipo_venta_id: 2, cliente_nombre: 'Rosa', lineas: [{ id: randomUUID(), producto_id: 1, cantidad: 1 }] }).expect(201);
    await http().post(`/pedidos/${id}/lineas`).set(headers('uid-mesero-01')).send({ lineas: [{ id: randomUUID(), producto_id: 2, cantidad: 2, notas: 'Sin hielo' }] }).expect(201);
    const total = (await http().get(`/pedidos/${id}`).set(headers('uid-cajero-01')).expect(200)).body.total;
    await http().post('/caja/pagos').set(headers('uid-cajero-01')).send({ id: randomUUID(), pedido_id: id, metodo_pago_id: 1, monto: total }).expect(201);
    await http().get(`/auditoria?pedido=${id}`).set(headers('uid-cajero-01')).expect(403);
    const eventos: { usuario: string; que: string; explicacion: string }[] = (await http().get(`/auditoria?pedido=${id}`).set(headers('seg-gerente')).expect(200)).body;
    const de = (texto: RegExp) => eventos.find((e) => texto.test(e.explicacion));
    expect(de(/^Creó el pedido para Rosa/)?.usuario).toBe('Luis Cajero');
    expect(de(/^Agregó 2 × .* \(notas: Sin hielo\)/)?.usuario).toBe('Ana Mesera');
    expect(de(/^Cobró Q .* con Efectivo/)?.usuario).toBe('Luis Cajero');
    expect(eventos.every((e) => e.usuario !== 'Sistema (sin usuario registrado)')).toBe(true);
    // El pedido de otro centro no aparece en la auditoría del centro 1.
    expect((await http().get(`/auditoria?pedido=${ajeno}`).set(headers('seg-gerente')).expect(200)).body).toHaveLength(0);
    await http().get('/auditoria').set(headers('seg-gerente')).expect(400);
    const usuarios = (await http().get('/auditoria/usuarios').set(headers('seg-gerente')).expect(200)).body;
    expect(usuarios.some((u: { nombre: string }) => u.nombre === 'Luis Cajero')).toBe(true);
  });
  it('registra dispositivos del centro sin repetir códigos (Tarea 17)', async () => {
    const lista = (await http().get('/dispositivos').set(headers('uid-mesero-01')).expect(200)).body;
    expect(lista.map((d: { codigo: string }) => d.codigo)).toEqual(['CAJA1', 'TAB01']);
    await http().post('/dispositivos').set(headers('uid-cajero-01')).send({ codigo: 'CAJA9', nombre: 'Caja', tipo: 'CAJA' }).expect(403);
    await http().post('/dispositivos').set(headers('seg-gerente')).send({ codigo: 'caja 2', nombre: 'Caja', tipo: 'CAJA' }).expect(400);
    const nuevo = (await http().post('/dispositivos').set(headers('seg-gerente')).send({ codigo: 'caja2', nombre: 'Caja terraza', tipo: 'CAJA' }).expect(201)).body;
    expect(nuevo).toMatchObject({ codigo: 'CAJA2', nombre: 'Caja terraza', tipo: 'CAJA' });
    const repetido = await http().post('/dispositivos').set(headers('seg-gerente')).send({ codigo: 'CAJA2', nombre: 'Otra', tipo: 'CAJA' }).expect(409);
    expect(repetido.body.mensaje).toMatch(/ya está registrado/);
    expect((await http().get('/dispositivos').set(headers('seg-admin', 2)).expect(200)).body).toHaveLength(0);
  });
});
