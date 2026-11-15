import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Cocina independiente del cobro (base aislada)', () => {
  let app: INestApplication;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  let socket: Socket;
  let url: string;
  let cocineroId: number;
  const http = () => request(app.getHttpServer());
  const headers = (uid = 'cocina-prueba', centro = 1) => ({ Authorization: `Bearer ${uid}`, 'X-Centro-Id': String(centro) });
  const cajero = () => headers('uid-cajero-01');
  const linea = () => ({ id: randomUUID(), producto_id: 1, cantidad: 1, notas: 'Sin cebolla' });
  async function crear() {
    return (await http().post('/pedidos').set(cajero()).send({ id: randomUUID(), tipo_venta_id: 1, mesa_referencia: 'Mesa cocina', lineas: [linea()] }).expect(201)).body;
  }
  async function cambiar(id: string, actual: string, destino: string, codigo = 201) {
    const p = /^[a-f0-9-]{36}$/.test(id) ? await base.prisma.pedido.findUnique({ where: { id } }) : null;
    return http().post(`/cocina/${id}/estado`).set(headers()).send({ estado_actual: actual, estado_cocina: destino, version_actual: p?.version ?? 1 }).expect(codigo);
  }
  function esperar(evento: string) {
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`No llegó ${evento}`)), 4000);
      socket.once(evento, v => { clearTimeout(timeout); resolve(v); });
    });
  }
  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base.prisma)
      .overrideProvider(VerificadorFirebase).useValue({ verificar: async (token: string) => ({ uid: token }) }).compile();
    app = modulo.createNestApplication(); await app.listen(0, '127.0.0.1'); url = await app.getUrl();
    cocineroId = (await base.prisma.usuario.create({ data: { firebase_uid: 'cocina-prueba', nombre: 'Cocinera', email: 'cocina@prueba.test', rol: 'COCINA', usuario_centro: { create: { centro_venta_id: 1 } } } })).id;
    await base.prisma.usuario.create({ data: { firebase_uid: 'cocina-admin', nombre: 'Admin', email: 'cocina-admin@prueba.test', rol: 'ADMIN' } });
  });
  afterAll(async () => { socket?.disconnect(); try { await app?.close(); } finally { await base?.cerrar(); } });

  it('un pedido nuevo y su preparación avisan sin recargar; cocina no recibe datos de pagos', async () => {
    socket = io(`${url}/ventas`, { autoConnect: false, auth: { token: 'cocina-prueba', centro_id: 1 }, transports: ['websocket'], reconnection: false });
    const conectado = esperar('connect'); socket.connect(); await conectado;
    const avisoNuevo = esperar('pedido:actualizado'); const p = await crear();
    expect(await avisoNuevo).toEqual({ pedido_id: p.id });
    const lista = await http().get('/cocina').set(headers()).expect(200);
    const fila = lista.body.find((f: { id: string }) => f.id === p.id);
    expect(fila).toMatchObject({ estado_cocina: 'PENDIENTE', mesa_referencia: 'Mesa cocina', pedido_detalle: [{ nuevo: false, notas: 'Sin cebolla' }] });
    expect(fila).not.toHaveProperty('total'); expect(fila).not.toHaveProperty('pago');
    const avisoEstado = esperar('pedido:actualizado');
    await cambiar(p.id, 'PENDIENTE', 'EN_PREPARACION', 201);
    expect(await avisoEstado).toEqual({ pedido_id: p.id });
    expect((await http().get(`/pedidos/${p.id}`).set(cajero()).expect(200)).body.estado_cocina).toBe('EN_PREPARACION');
    socket.disconnect();
  });

  it('cobrar antes de cocinar conserva PAGADO al preparar, finalizar y entregar; no admite otro cobro ni productos', async () => {
    const p = await crear();
    await http().post('/caja/pagos').set(cajero()).send({ id: randomUUID(), pedido_id: p.id, metodo_pago_id: 1, monto: 45 }).expect(201);
    for (const [actual, destino] of [['PENDIENTE', 'EN_PREPARACION'], ['EN_PREPARACION', 'LISTO'], ['LISTO', 'ENTREGADO']]) {
      await cambiar(p.id, actual, destino, 201);
      const comprobante = await http().get(`/caja/pedidos/${p.id}/comprobante`).set(cajero()).expect(200);
      expect(comprobante.body.pedido).toMatchObject({ estado: 'PAGADO', estado_cocina: destino, pagado: '45.00', saldo: '0.00' });
    }
    await http().post('/caja/pagos').set(cajero()).send({ id: randomUUID(), pedido_id: p.id, metodo_pago_id: 1, monto: 45 }).expect(409);
    await http().post(`/pedidos/${p.id}/lineas`).set(cajero()).send({ lineas: [linea()] }).expect(409);
    expect(await base.prisma.pago.count({ where: { pedido_id: p.id } })).toBe(1);
    const auditoria = await base.prisma.auditoria.findFirst({ where: { registro_id: p.id, usuario_id: cocineroId }, orderBy: { id: 'desc' } });
    expect(auditoria).not.toBeNull();
  });

  it('valida transiciones, reintentos y dos cocineros simultáneos', async () => {
    const p = await crear();
    await cambiar(p.id, 'PENDIENTE', 'ENTREGADO', 400);
    const respuestas = await Promise.all([1, 2].map(() => cambiar(p.id, 'PENDIENTE', 'EN_PREPARACION', 201)));
    expect(respuestas.every(r => r.body.estado_cocina === 'EN_PREPARACION')).toBe(true);
    await cambiar(p.id, 'EN_PREPARACION', 'LISTO', 201);
    await cambiar(p.id, 'PENDIENTE', 'EN_PREPARACION', 409);
    await http().post(`/cocina/${p.id}/estado`).set(headers()).send({ estado_cocina: 'OTRO' }).expect(400);
  });

  it('los agregados después son NUEVO y reabren preparación sin duplicar ni mostrar líneas anuladas', async () => {
    const p = await crear();
    await cambiar(p.id, 'PENDIENTE', 'EN_PREPARACION', 201); await cambiar(p.id, 'EN_PREPARACION', 'LISTO', 201);
    const extra = linea(); const cuerpo = { lineas: [extra] };
    await http().post(`/pedidos/${p.id}/lineas`).set(cajero()).send(cuerpo).expect(201);
    let lista = (await http().get('/cocina').set(headers()).expect(200)).body;
    let fila = lista.find((f: { id: string }) => f.id === p.id);
    expect(fila.estado_cocina).toBe('PENDIENTE');
    expect(fila.pedido_detalle.find((l: { id: string }) => l.id === extra.id).nuevo).toBe(true);
    await cambiar(p.id, 'PENDIENTE', 'EN_PREPARACION', 201); await cambiar(p.id, 'EN_PREPARACION', 'LISTO', 201);
    await http().post(`/pedidos/${p.id}/lineas`).set(cajero()).send(cuerpo).expect(201);
    expect((await base.prisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).estado_cocina).toBe('LISTO');
    await http().post(`/pedidos/${p.id}/lineas/${extra.id}/anulacion`).set(cajero()).send({ motivo: 'Ya no lo pidió' }).expect(403);
    await http().post(`/pedidos/${p.id}/lineas/${extra.id}/anulacion`).set(headers('cocina-admin')).send({ motivo: 'Ya no lo pidió' }).expect(201);
    lista = (await http().get('/cocina').set(headers()).expect(200)).body; fila = lista.find((f: { id: string }) => f.id === p.id);
    expect(fila.pedido_detalle).toHaveLength(1);
    await cambiar(p.id, 'LISTO', 'ENTREGADO', 201);
    await http().post(`/pedidos/${p.id}/lineas`).set(cajero()).send({ lineas: [linea()] }).expect(201);
    expect((await base.prisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).estado_cocina).toBe('PENDIENTE');
  });

  it('conserva pendientes de días anteriores, excluye entregados antiguos y anulados', async () => {
    const pendiente = await crear(), entregado = await crear(), anulado = await crear();
    await base.prisma.pedido.update({ where: { id: pendiente.id }, data: { fecha_operacion: new Date('2020-01-01') } });
    await base.prisma.pedido.update({ where: { id: entregado.id }, data: { fecha_operacion: new Date('2020-01-01'), estado_cocina: 'ENTREGADO' } });
    await base.prisma.pedido.update({ where: { id: anulado.id }, data: { estado: 'ANULADO' } });
    const lista = (await http().get('/cocina').set(headers()).expect(200)).body.map((f: { id: string }) => f.id);
    expect(lista).toContain(pendiente.id); expect(lista).not.toContain(entregado.id); expect(lista).not.toContain(anulado.id);
    await cambiar(anulado.id, 'PENDIENTE', 'EN_PREPARACION', 409);
  });

  it('bloquea roles, centros, UUID inválidos y pedidos de otro centro', async () => {
    const p = await crear();
    await http().get('/cocina').set(cajero()).expect(403);
    await http().post(`/cocina/${p.id}/estado`).set(cajero()).send({ estado_actual: 'PENDIENTE', estado_cocina: 'EN_PREPARACION' }).expect(403);
    await http().get('/cocina').set(headers('cocina-prueba', 2)).expect(403);
    await http().get('/cocina').set(headers('cocina-admin', 2)).expect(200);
    await http().post(`/cocina/${p.id}/estado`).set(headers('cocina-admin', 2)).send({ estado_actual: 'PENDIENTE', estado_cocina: 'EN_PREPARACION', version_actual: 1 }).expect(404);
    await cambiar('no-uuid', 'PENDIENTE', 'EN_PREPARACION', 400);
    await cambiar(randomUUID(), 'PENDIENTE', 'EN_PREPARACION', 404);
  });

  it('no marca listo con una pantalla antigua si llegaron productos nuevos durante la preparación', async () => {
    const p = await crear();
    const preparando = await cambiar(p.id, 'PENDIENTE', 'EN_PREPARACION');
    await http().post(`/pedidos/${p.id}/lineas`).set(cajero()).send({ lineas: [linea()] }).expect(201);
    await http().post(`/cocina/${p.id}/estado`).set(headers()).send({ estado_actual: 'EN_PREPARACION', estado_cocina: 'LISTO', version_actual: preparando.body.version }).expect(409);
    expect((await base.prisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).estado_cocina).toBe('EN_PREPARACION');
    await cambiar(p.id, 'EN_PREPARACION', 'LISTO');
  });

  it('actualiza bases anteriores, conserva preparación previa y repetir la actualización no reinicia estados', async () => {
    const p = await crear();
    // Solo la base desechable reproduce el esquema anterior para probar la actualización real.
    await base.ejecutarSql(`SET search_path TO ventas, public; ALTER TABLE ventas.pedido DROP COLUMN estado_cocina; UPDATE ventas.pedido SET estado = 'LISTO' WHERE id = '${p.id}';`);
    const sql = await readFile('../../db/05_estado_cocina.sql', 'utf8');
    await base.ejecutarSql(sql);
    expect((await base.prisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).estado_cocina).toBe('LISTO');
    await base.prisma.pedido.update({ where: { id: p.id }, data: { estado_cocina: 'ENTREGADO' } });
    await base.ejecutarSql(sql);
    expect((await base.prisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).estado_cocina).toBe('ENTREGADO');
  });
});
