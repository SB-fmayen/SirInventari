import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { GestorUsuariosFirebase, VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

/**
 * Permisos por rol y centro + administración de usuarios (Tarea 5), contra la base de Docker.
 * Firebase se simula: el token "token-<uid>" es el usuario <uid>.
 */
class VerificadorFalso {
  async verificar(token: string) {
    if (!token.startsWith('token-')) throw new Error('token inválido');
    return { uid: token.slice('token-'.length) };
  }
}

class GestorFalso {
  creados: string[] = [];
  borrados: string[] = [];
  cambios: { uid: string; activo: boolean }[] = [];
  async crearOObtener(email: string) {
    const uid = `uid-e2e-${email}`;
    this.creados.push(uid);
    return { uid, creado: true };
  }
  async borrar(uid: string) {
    this.borrados.push(uid);
  }
  async cambiarActivo(uid: string, activo: boolean) {
    this.cambios.push({ uid, activo });
  }
}

const ADMIN = 'uid-e2e-admin';
const PREFIJO = 'e2e-';

describe('Permisos por rol y centro (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  const gestor = new GestorFalso();

  async function limpiar() {
    const usuarios = await prisma.usuario.findMany({
      where: { OR: [{ firebase_uid: { startsWith: 'uid-e2e-' } }, { email: { startsWith: PREFIJO } }] },
      select: { id: true },
    });
    const ids = usuarios.map((u) => u.id);
    await prisma.usuario_centro.deleteMany({ where: { usuario_id: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(base.prisma)
      .overrideProvider(VerificadorFirebase)
      .useClass(VerificadorFalso)
      .overrideProvider(GestorUsuariosFirebase)
      .useValue(gestor)
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await limpiar();
    await prisma.usuario.create({
      data: { firebase_uid: ADMIN, nombre: 'Admin E2E', email: `${PREFIJO}admin@prueba.test`, rol: 'ADMIN' },
    });
  });

  afterAll(async () => {
    try { await app?.close(); } finally { await base?.cerrar(); }
  });

  const como = (uid: string) => ({ Authorization: `Bearer token-${uid}` });
  const http = () => request(app.getHttpServer());

  describe('roles', () => {
    it('un MESERO no puede entrar a usuarios', async () => {
      const res = await http().get('/usuarios').set(como('uid-mesero-01')).expect(403);
      expect(res.body.mensaje).toBe('No tienes permiso para hacer esto.');
    });

    it('un CAJERO no puede ver los centros del formulario de usuarios', async () => {
      await http().get('/centros').set(como('uid-cajero-01')).expect(403);
    });

    it('el ADMIN ve la lista de usuarios y los centros', async () => {
      const usuarios = await http().get('/usuarios').set(como(ADMIN)).expect(200);
      expect(usuarios.body.some((u: { email: string }) => u.email === 'ana@ejemplo.com')).toBe(true);
      const centros = await http().get('/centros').set(como(ADMIN)).expect(200);
      expect(centros.body.map((c: { codigo: string }) => c.codigo)).toEqual(['CV01', 'CV02']);
    });
  });

  describe('centro de venta elegido', () => {
    it('acepta un centro del usuario', async () => {
      await http().get('/sesion').set(como('uid-mesero-01')).set('X-Centro-Id', '1').expect(200);
    });

    it('rechaza un centro que no es del usuario', async () => {
      const res = await http().get('/sesion').set(como('uid-mesero-01')).set('X-Centro-Id', '2').expect(403);
      expect(res.body.mensaje).toBe('No tienes acceso a ese centro de venta.');
    });

    it('el ADMIN puede elegir cualquier centro activo', async () => {
      await http().get('/sesion').set(como(ADMIN)).set('X-Centro-Id', '2').expect(200);
    });

    it('un GERENTE solo recibe sus centros en el listado', async () => {
      await prisma.usuario.create({
        data: {
          firebase_uid: 'uid-e2e-gerente', nombre: 'Gerente E2E',
          email: `${PREFIJO}gerente@prueba.test`, rol: 'GERENTE',
          usuario_centro: { create: { centro_venta_id: 1 } },
        },
      });
      const res = await http().get('/centros').set(como('uid-e2e-gerente')).expect(200);
      expect(res.body.map((c: { id: number }) => c.id)).toEqual([1]);
    });
  });

  describe('administración de usuarios', () => {
    let idCajero: number;

    it('crea un usuario en Firebase y en la base con su rol y centros', async () => {
      const res = await http()
        .post('/usuarios')
        .set(como(ADMIN))
        .send({ nombre: 'Carla Cajera', email: `${PREFIJO}carla@prueba.test`, contrasena: 'secreta1', rol: 'CAJERO', centros: [1] })
        .expect(201);
      expect(res.body).toMatchObject({ nombre: 'Carla Cajera', rol: 'CAJERO', activo: true });
      expect(res.body.centros.map((c: { id: number }) => c.id)).toEqual([1]);
      expect(gestor.creados).toContain(`uid-e2e-${PREFIJO}carla@prueba.test`);
      idCajero = res.body.id;
    });

    it('registra un usuario que ya existe en Firebase usando su UID', async () => {
      const res = await http()
        .post('/usuarios')
        .set(como(ADMIN))
        .send({ nombre: 'Coco Cocina', email: `${PREFIJO}coco@prueba.test`, firebaseUid: 'uid-e2e-coco', rol: 'COCINA', centros: [1] })
        .expect(201);
      expect(res.body.firebaseUid).toBe('uid-e2e-coco');
    });

    it('no repite correos y ni siquiera llama a Firebase', async () => {
      const antes = gestor.creados.length;
      const res = await http()
        .post('/usuarios')
        .set(como(ADMIN))
        .send({ nombre: 'Otra', email: `${PREFIJO}carla@prueba.test`, contrasena: 'secreta1', rol: 'MESERO', centros: [1] })
        .expect(409);
      expect(res.body.mensaje).toBe('Ya existe un usuario con ese correo.');
      expect(gestor.creados.length).toBe(antes);
    });

    it('si la base falla después de crear en Firebase, se deshace en Firebase', async () => {
      // Firebase devuelve un UID que ya usa otro usuario de la base
      const original = gestor.crearOObtener.bind(gestor);
      gestor.crearOObtener = async () => ({ uid: 'uid-mesero-01', creado: true });
      try {
        await http()
          .post('/usuarios')
          .set(como(ADMIN))
          .send({ nombre: 'Choque', email: `${PREFIJO}choque@prueba.test`, contrasena: 'secreta1', rol: 'MESERO', centros: [1] })
          .expect(409);
        expect(gestor.borrados).toContain('uid-mesero-01');
      } finally {
        gestor.crearOObtener = original;
      }
    });

    it('valida los datos con mensajes en español', async () => {
      const sinCentro = await http()
        .post('/usuarios')
        .set(como(ADMIN))
        .send({ nombre: 'X', email: `${PREFIJO}x@prueba.test`, contrasena: 'secreta1', rol: 'MESERO', centros: [] })
        .expect(400);
      expect(sinCentro.body.mensaje).toBe('Asigna al menos un centro de venta.');

      const rolMalo = await http()
        .post('/usuarios')
        .set(como(ADMIN))
        .send({ nombre: 'X', email: `${PREFIJO}x@prueba.test`, contrasena: 'secreta1', rol: 'JEFE', centros: [1] })
        .expect(400);
      expect(rolMalo.body.mensaje).toContain('Elige un rol válido');

      const corta = await http()
        .post('/usuarios')
        .set(como(ADMIN))
        .send({ nombre: 'X', email: `${PREFIJO}x@prueba.test`, contrasena: '123', rol: 'MESERO', centros: [1] })
        .expect(400);
      expect(corta.body.mensaje).toBe('La contraseña debe tener al menos 6 caracteres.');

      const centroInexistente = await http()
        .post('/usuarios')
        .set(como(ADMIN))
        .send({ nombre: 'X', email: `${PREFIJO}x@prueba.test`, contrasena: 'secreta1', rol: 'MESERO', centros: [99] })
        .expect(400);
      expect(centroInexistente.body.mensaje).toBe('Uno de los centros de venta no existe o está desactivado.');
    });

    it('cambia el rol y los centros', async () => {
      const res = await http()
        .patch(`/usuarios/${idCajero}`)
        .set(como(ADMIN))
        .send({ rol: 'GERENTE', centros: [1, 2] })
        .expect(200);
      expect(res.body.rol).toBe('GERENTE');
      expect(res.body.centros.map((c: { id: number }) => c.id)).toEqual([1, 2]);
    });

    it('al desactivar, el usuario pierde el acceso de inmediato', async () => {
      const uid = `uid-e2e-${PREFIJO}carla@prueba.test`;
      await http().get('/sesion').set(como(uid)).expect(200);
      await http().patch(`/usuarios/${idCajero}/activo`).set(como(ADMIN)).send({ activo: false }).expect(200);
      const res = await http().get('/sesion').set(como(uid)).expect(403);
      expect(res.body.mensaje).toBe('Tu usuario no tiene acceso. Habla con el administrador.');
      expect(gestor.cambios).toContainEqual({ uid, activo: false });
    });

    it('el ADMIN no puede desactivarse a sí mismo', async () => {
      const yo = await prisma.usuario.findUniqueOrThrow({ where: { firebase_uid: ADMIN } });
      const res = await http().patch(`/usuarios/${yo.id}/activo`).set(como(ADMIN)).send({ activo: false }).expect(400);
      expect(res.body.mensaje).toBe('No puedes desactivar tu propio usuario.');
    });
  });
});
