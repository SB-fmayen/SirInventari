import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Pedidos con folio y líneas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  let centroId: number;
  let categoriaId: number;
  let productoId: number;
  let usuarioId: number;
  let otroId: number;
  const uid = `pedidos-${randomUUID()}`;
  const otroUid = `pedidos-${randomUUID()}`;
  const ids = [randomUUID(), randomUUID()];
  const lineaInicial = randomUUID();
  const lineaAgregada = randomUUID();
  const http = () => request(app.getHttpServer());
  const headers = (token = uid) => ({ Authorization: `Bearer ${token}`, 'X-Centro-Id': String(centroId) });
  const datos = (id: string, linea = randomUUID()) => ({ id, tipo_venta_id: 1, mesa_referencia: 'Mesa 4', lineas: [{ id: linea, producto_id: productoId, cantidad: 2, notas: 'Sin hielo', precio_unitario: '0.01' }] });

  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base.prisma).overrideProvider(VerificadorFirebase)
      .useValue({ verificar: async (token: string) => ({ uid: token }) }).compile();
    app = modulo.createNestApplication(); await app.init(); prisma = app.get(PrismaService);
    centroId = (await prisma.centro_venta.create({ data: { codigo: `P${randomUUID().slice(0, 8)}`, nombre: 'Centro prueba pedidos' } })).id;
    for (const token of [uid, otroUid]) {
      const u = await prisma.usuario.create({ data: { firebase_uid: token, email: `${token}@prueba.test`, nombre: token === uid ? 'Mesera inicial' : 'Mesero adicional', rol: 'MESERO', usuario_centro: { create: { centro_venta_id: centroId } } } });
      if (token === uid) usuarioId = u.id; else otroId = u.id;
    }
    categoriaId = (await prisma.categoria.create({ data: { nombre: `Cat ${randomUUID()}` } })).id;
    productoId = (await prisma.producto.create({ data: { sku: `P-${randomUUID().slice(0, 12)}`, nombre: 'Limonada prueba', categoria_id: categoriaId, precio_base: 12, producto_centro: { create: { centro_venta_id: centroId, precio: '18.75' } } } })).id;
  });

  afterAll(async () => {
    try { await app?.close(); } finally { await base?.cerrar(); }
  });

  it('dos pedidos simultáneos reciben folios 1 y 2, precio del servidor y fecha de Guatemala', async () => {
    const respuestas = await Promise.all(ids.map((id, i) => http().post('/pedidos').set(headers()).send(datos(id, i === 0 ? lineaInicial : randomUUID())).expect(201)));
    expect(respuestas.map((r) => r.body.folio).sort((a, b) => a - b)).toEqual([1, 2]);
    const [hoy] = await prisma.$queryRaw<{ fecha: string }[]>`SELECT ventas.fecha_guatemala()::text AS fecha`;
    for (const r of respuestas) {
      expect(r.body).toMatchObject({ total: '37.5', fecha_operacion: hoy.fecha, usuario: { nombre: 'Mesera inicial' } });
      expect(r.body.pedido_detalle[0].precio_unitario).toBe('18.75');
    }
  });

  it('reenviar el pedido y sus líneas no duplica; un UUID con otros datos se rechaza', async () => {
    const respuestas = await Promise.all([1, 2].map(() => http().post('/pedidos').set(headers()).send(datos(ids[0], lineaInicial)).expect(201)));
    expect(respuestas[0].body.pedido_detalle).toHaveLength(1);
    expect(await prisma.pedido.count({ where: { centro_venta_id: centroId } })).toBe(2);
    await http().post('/pedidos').set(headers()).send({ ...datos(ids[0], lineaInicial), mesa_referencia: 'Otra mesa' }).expect(409);
    const contador = await prisma.folio_contador.findUniqueOrThrow({ where: { centro_venta_id_fecha_operacion: { centro_venta_id: centroId, fecha_operacion: new Date(`${respuestas[0].body.fecha_operacion}T00:00:00Z`) } } });
    expect(contador.ultimo_folio).toBe(2);
  });

  it('agregar después conserva quién y cuándo; anular exige motivo y recalcula el total', async () => {
    const desde = Date.now();
    const cuerpo = { lineas: [{ id: lineaAgregada, producto_id: productoId, cantidad: 1, notas: 'Agregado después' }] };
    const r = await http().post(`/pedidos/${ids[0]}/lineas`).set(headers(otroUid)).send(cuerpo).expect(201);
    expect(r.body.total).toBe('56.25');
    const linea = r.body.pedido_detalle.find((l: { id: string }) => l.id === lineaAgregada);
    expect(linea).toMatchObject({ agregado_por: otroId, usuario_pedido_detalle_agregado_porTousuario: { nombre: 'Mesero adicional' } });
    expect(new Date(linea.agregado_en).getTime()).toBeGreaterThanOrEqual(desde - 1000);
    expect((await http().post(`/pedidos/${ids[0]}/lineas`).set(headers(otroUid)).send(cuerpo).expect(201)).body.pedido_detalle).toHaveLength(2);
    await http().post(`/pedidos/${ids[0]}/lineas/${lineaAgregada}/anulacion`).set(headers()).send({ motivo: '  ' }).expect(400);
    const anulacion = await http().post(`/pedidos/${ids[0]}/lineas/${lineaAgregada}/anulacion`).set(headers()).send({ motivo: 'Cliente cambió de opinión' }).expect(201);
    expect(anulacion.body.total).toBe('37.5');
    expect(anulacion.body.pedido_detalle.find((l: { id: string }) => l.id === lineaAgregada)).toMatchObject({ estado: 'ANULADA', anulado_por: usuarioId, motivo_anulacion: 'Cliente cambió de opinión' });
  });

  it('guarda consumo en mesa sin número de mesa ni cliente identificado y permite reintentar', async () => {
    const cuerpo = { ...datos(randomUUID()), mesa_referencia: '' };
    const creado = await http().post('/pedidos').set(headers()).send(cuerpo).expect(201);
    expect(creado.body).toMatchObject({ tipo_venta_id: 1, mesa_referencia: null, cliente_nombre: null, total: '37.5' });
    const repetido = await http().post('/pedidos').set(headers()).send(cuerpo).expect(201);
    expect(repetido.body.id).toBe(creado.body.id);
    expect(repetido.body.folio).toBe(creado.body.folio);
  });

  it('no agrega productos a pedidos pagados o anulados ni acepta productos no disponibles', async () => {
    for (const estado of ['PAGADO', 'ANULADO'] as const) {
      await prisma.pedido.update({ where: { id: ids[0] }, data: { estado } });
      await http().post(`/pedidos/${ids[0]}/lineas`).set(headers()).send({ lineas: datos(randomUUID()).lineas }).expect(409);
    }
    await prisma.pedido.update({ where: { id: ids[0] }, data: { estado: 'ABIERTO' } });
    await prisma.producto_centro.update({ where: { producto_id_centro_venta_id: { producto_id: productoId, centro_venta_id: centroId } }, data: { disponible: false } });
    await http().post(`/pedidos/${ids[0]}/lineas`).set(headers()).send({ lineas: datos(randomUUID()).lineas }).expect(400);
    expect((await http().get('/pedidos/catalogo').set(headers()).expect(200)).body.some((p: { id: number }) => p.id === productoId)).toBe(false);
  });

  it('lista el día con búsqueda por folio y bloquea rol, centro y UUID inválido', async () => {
    const detalle = await http().get(`/pedidos/${ids[0]}`).set(headers()).expect(200);
    expect((await http().get(`/pedidos?buscar=${detalle.body.folio}`).set(headers()).expect(200)).body).toHaveLength(1);
    await http().get(`/pedidos/${ids[0]}`).set({ ...headers(), 'X-Centro-Id': '1' }).expect(403);
    await http().get('/pedidos/no-es-uuid').set(headers()).expect(400);
    await prisma.usuario.update({ where: { id: usuarioId }, data: { rol: 'COCINA' } });
    await http().post('/pedidos').set(headers()).send(datos(randomUUID())).expect(403);
  });
});
