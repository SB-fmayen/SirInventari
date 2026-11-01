import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

/**
 * Login (Tarea 4) contra la base de Docker.
 * Firebase se reemplaza por un verificador falso: el token "token-<uid>" equivale al usuario <uid>.
 */
class VerificadorFalso {
  async verificar(token: string) {
    if (!token.startsWith('token-')) throw new Error('token inválido');
    return { uid: token.slice('token-'.length) };
  }
}

const UID_INACTIVO = 'uid-prueba-inactivo';
const UID_ADMIN = 'uid-prueba-admin';

describe('Sesión con Firebase (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;

  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(base.prisma)
      .overrideProvider(VerificadorFirebase)
      .useClass(VerificadorFalso)
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.usuario.deleteMany({ where: { firebase_uid: { in: [UID_INACTIVO, UID_ADMIN] } } });
    await prisma.usuario.createMany({
      data: [
        { firebase_uid: UID_INACTIVO, nombre: 'Prueba Inactivo', email: 'inactivo@prueba.test', rol: 'CAJERO', activo: false },
        { firebase_uid: UID_ADMIN, nombre: 'Prueba Admin', email: 'admin@prueba.test', rol: 'ADMIN' },
      ],
    });
  });

  afterAll(async () => {
    try { await app?.close(); } finally { await base?.cerrar(); }
  });

  const servidor = () => app.getHttpServer();

  it('/salud sigue siendo pública', async () => {
    await request(servidor()).get('/salud').expect(200);
  });

  it('sin token pide iniciar sesión', async () => {
    const res = await request(servidor()).get('/sesion').expect(401);
    expect(res.body).toEqual({ statusCode: 401, mensaje: 'Necesitas iniciar sesión.' });
  });

  it('un token inválido o vencido pide volver a iniciar sesión', async () => {
    const res = await request(servidor()).get('/sesion').set('Authorization', 'Bearer basura').expect(401);
    expect(res.body.mensaje).toBe('Tu sesión terminó o no es válida. Vuelve a iniciar sesión.');
  });

  it('un usuario de Firebase que no está en la base no tiene acceso', async () => {
    const res = await request(servidor())
      .get('/sesion')
      .set('Authorization', 'Bearer token-uid-que-no-existe')
      .expect(403);
    expect(res.body.mensaje).toBe('Tu usuario no tiene acceso. Habla con el administrador.');
  });

  it('un usuario inactivo no tiene acceso', async () => {
    const res = await request(servidor())
      .get('/sesion')
      .set('Authorization', `Bearer token-${UID_INACTIVO}`)
      .expect(403);
    expect(res.body.mensaje).toBe('Tu usuario no tiene acceso. Habla con el administrador.');
  });

  it('un usuario activo recibe su rol y sus centros', async () => {
    const res = await request(servidor())
      .get('/sesion')
      .set('Authorization', 'Bearer token-uid-mesero-01')
      .expect(200);
    expect(res.body).toMatchObject({
      nombre: 'Ana Mesera',
      rol: 'MESERO',
      centros: [{ id: 1, codigo: 'CV01', nombre: 'Centro de venta 1' }],
    });
  });

  it('el ADMIN ve todos los centros activos', async () => {
    const res = await request(servidor())
      .get('/sesion')
      .set('Authorization', `Bearer token-${UID_ADMIN}`)
      .expect(200);
    expect(res.body.rol).toBe('ADMIN');
    expect(res.body.centros.map((c: { codigo: string }) => c.codigo)).toEqual(['CV01', 'CV02']);
  });
});
