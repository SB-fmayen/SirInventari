import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Catálogo por centro (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuarioId: number;
  let categoriaId: number;
  let productoId: number;
  const uid = `catalogo-${randomUUID()}`;
  const nombre = `Categoría ${randomUUID()}`;
  const sku = `PR-${randomUUID().slice(0, 12)}`;
  const http = () => request(app.getHttpServer());
  const headers = (centro = 1) => ({ Authorization: `Bearer ${uid}`, 'X-Centro-Id': String(centro) });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VerificadorFirebase).useValue({ verificar: async (token: string) => ({ uid: token }) }).compile();
    app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    usuarioId = (await prisma.usuario.create({ data: { firebase_uid: uid, nombre: 'Admin catálogo', email: `${uid}@prueba.test`, rol: 'ADMIN' } })).id;
  });

  afterAll(async () => {
    if (usuarioId) await prisma.usuario_centro.deleteMany({ where: { usuario_id: usuarioId } });
    if (productoId) {
      await prisma.producto_centro.deleteMany({ where: { producto_id: productoId } });
      await prisma.producto.delete({ where: { id: productoId } });
    }
    if (categoriaId) await prisma.categoria.delete({ where: { id: categoriaId } });
    if (usuarioId) await prisma.usuario.delete({ where: { id: usuarioId } });
    await app.close();
  });

  it('crea y ordena categorías y productos, rechaza duplicados y precios incorrectos', async () => {
    const c = await http().post('/catalogo/categorias').set(headers()).send({ nombre, orden: 12 }).expect(201);
    categoriaId = c.body.id;
    await http().patch(`/catalogo/categorias/${categoriaId}`).set(headers()).send({ orden: 2, nombre: `${nombre} editada` }).expect(200);
    const p = await http().post('/catalogo/productos').set(headers()).send({ sku, nombre: 'Producto de prueba', categoria_id: categoriaId, precio_base: '12.50' }).expect(201);
    productoId = p.body.id;
    await http().post('/catalogo/productos').set(headers()).send({ sku, nombre: 'Duplicado', categoria_id: categoriaId, precio_base: '1' }).expect(409);
    for (const precio_base of [-1, '0.001', 'NaN', null]) {
      await http().patch(`/catalogo/productos/${productoId}`).set(headers()).send({ precio_base }).expect(400);
    }
  });

  it('el precio por centro no se mezcla y null vuelve al precio base; cero es válido', async () => {
    const ruta = `/catalogo/productos?buscar=${encodeURIComponent(sku)}&categoria_id=${categoriaId}`;
    await http().patch(`/catalogo/productos/${productoId}/centro`).set(headers(2)).send({ precio: '18.75', disponible: false }).expect(200);
    expect((await http().get(ruta).set(headers(1)).expect(200)).body[0]).toMatchObject({ precio: '12.5', precio_centro: null, disponible: true });
    expect((await http().get(ruta).set(headers(2)).expect(200)).body[0]).toMatchObject({ precio: '18.75', disponible: false, disponible_venta: false });
    await http().patch(`/catalogo/productos/${productoId}/centro`).set(headers(2)).send({ precio: 0 }).expect(200);
    expect((await http().get(ruta).set(headers(2))).body[0].precio).toBe('0');
    await http().patch(`/catalogo/productos/${productoId}/centro`).set(headers(2)).send({ precio: null, disponible: true }).expect(200);
    expect((await http().get(ruta).set(headers(2))).body[0].precio).toBe('12.5');
  });

  it('desactiva sin borrar y una categoría inactiva impide vender sus productos', async () => {
    const ruta = `/catalogo/productos?categoria_id=${categoriaId}`;
    await http().patch(`/catalogo/categorias/${categoriaId}`).set(headers()).send({ activo: false }).expect(200);
    expect((await http().get(ruta).set(headers())).body[0].disponible_venta).toBe(false);
    await http().patch(`/catalogo/productos/${productoId}`).set(headers()).send({ activo: false }).expect(200);
    expect((await http().get(ruta).set(headers())).body[0].activo).toBe(false);
    expect(await prisma.producto.count({ where: { id: productoId } })).toBe(1);
  });

  it('bloquea roles y centros ajenos y exige elegir centro', async () => {
    await prisma.usuario.update({ where: { id: usuarioId }, data: { rol: 'GERENTE', usuario_centro: { create: { centro_venta_id: 1 } } } });
    await http().get('/catalogo/productos').set(headers(2)).expect(403);
    await http().patch(`/catalogo/productos/${productoId}/centro`).set(headers(2)).send({ precio: 10 }).expect(403);
    await http().get('/catalogo/productos').set({ Authorization: `Bearer ${uid}` }).expect(400);
    await prisma.usuario.update({ where: { id: usuarioId }, data: { rol: 'MESERO' } });
    await http().get('/catalogo/categorias').set(headers()).expect(403);
    await http().post('/catalogo/productos').set(headers()).send({}).expect(403);
    await prisma.usuario_centro.deleteMany({ where: { usuario_id: usuarioId } });
  });
});
