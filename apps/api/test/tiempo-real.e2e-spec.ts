import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Avisos Socket.IO por centro (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  let url: string;
  const centros: number[] = [];
  const usuarios: number[] = [];
  const sockets: Socket[] = [];
  let categoriaId: number;
  let productoId: number;
  const mesero = `socket-m-${randomUUID()}`;
  const cocina = `socket-c-${randomUUID()}`;
  const idsLineas: string[] = [];
  const revocados = new Set<string>();

  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base.prisma).overrideProvider(VerificadorFirebase)
      .useValue({ verificar: async (token: string) => { if (!token.startsWith('socket-') || revocados.has(token)) throw new Error(); return { uid: token } } }).compile();
    app = modulo.createNestApplication(); await app.listen(0, '127.0.0.1'); url = await app.getUrl(); prisma = app.get(PrismaService);
    for (let n = 0; n < 2; n++) centros.push((await prisma.centro_venta.create({ data: { codigo: `S${randomUUID().slice(0, 8)}`, nombre: `Centro socket ${n}` } })).id);
    for (const [token, rol] of [[mesero, 'MESERO'], [cocina, 'COCINA']] as const) {
      usuarios.push((await prisma.usuario.create({ data: { firebase_uid: token, email: `${token}@prueba.test`, nombre: rol, rol, usuario_centro: { create: centros.map((centro_venta_id) => ({ centro_venta_id })) } } })).id);
    }
    categoriaId = (await prisma.categoria.create({ data: { nombre: `Cat ${randomUUID()}` } })).id;
    productoId = (await prisma.producto.create({ data: { categoria_id: categoriaId, sku: `S-${randomUUID().slice(0, 12)}`, nombre: 'Producto socket', precio_base: 12 } })).id;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    try { await app?.close(); } finally { await base?.cerrar(); }
  });

  function conectar(token: string | null, centroId: number) {
    const socket = io(`${url}/ventas`, { autoConnect: false, auth: { token, centro_id: centroId }, reconnection: false, transports: ['websocket'] });
    sockets.push(socket); return socket;
  }
  function esperar<T>(socket: Socket, evento: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const tiempo = setTimeout(() => reject(new Error(`No llegó el evento ${evento}`)), 3000);
      socket.once(evento, (valor: T) => { clearTimeout(tiempo); resolve(valor) });
    });
  }
  async function crear() {
    const lineaId = randomUUID(); idsLineas.push(lineaId);
    return request(app.getHttpServer()).post('/pedidos').set({ Authorization: `Bearer ${mesero}`, 'X-Centro-Id': String(centros[0]) })
      .send({ id: randomUUID(), tipo_venta_id: 1, mesa_referencia: 'Mesa socket', lineas: [{ id: lineaId, producto_id: productoId, cantidad: 1 }] }).expect(201);
  }

  it('rechaza conexiones sin token o con un centro no autorizado', async () => {
    for (const [token, centro] of [[null, centros[0]], [cocina, 1]] as const) {
      const s = conectar(token, centro); const error = esperar<Error>(s, 'connect_error'); s.connect();
      expect((await error).message).toContain('Revisa tu sesión y tu centro de venta');
      s.disconnect();
    }
  });

  it('un pedido nuevo llega a cocina sin recargar y no llega al otro centro', async () => {
    const mismo = conectar(cocina, centros[0]); const otro = conectar(cocina, centros[1]);
    const conexiones = [esperar(mismo, 'connect'), esperar(otro, 'connect')]; mismo.connect(); otro.connect(); await Promise.all(conexiones);
    const avisosOtros: unknown[] = []; otro.on('pedido:actualizado', (aviso: unknown) => avisosOtros.push(aviso));
    const evento = esperar<{ pedido_id: string }>(mismo, 'pedido:actualizado');
    const pedido = await crear(); expect(await evento).toEqual({ pedido_id: pedido.body.id });
    expect(avisosOtros).toHaveLength(0);
    mismo.disconnect(); otro.disconnect();
  });

  it('si el token vence después de conectar, no recibe otro aviso', async () => {
    const socket = conectar(cocina, centros[0]); const conectado = esperar(socket, 'connect'); socket.connect(); await conectado;
    revocados.add(cocina);
    const avisos: unknown[] = []; socket.on('pedido:actualizado', (aviso: unknown) => avisos.push(aviso));
    const desconectado = esperar(socket, 'disconnect'); await crear(); await desconectado;
    expect(avisos).toHaveLength(0);
    revocados.delete(cocina);
  });

  it('al desactivar al usuario se desconecta antes de recibir otro aviso', async () => {
    const socket = conectar(cocina, centros[0]); const conectado = esperar(socket, 'connect'); socket.connect(); await conectado;
    await prisma.usuario.update({ where: { firebase_uid: cocina }, data: { activo: false } });
    const avisos: unknown[] = []; socket.on('pedido:actualizado', (aviso: unknown) => avisos.push(aviso));
    const desconectado = esperar(socket, 'disconnect'); await crear(); await desconectado;
    expect(avisos).toHaveLength(0);
  });
});
