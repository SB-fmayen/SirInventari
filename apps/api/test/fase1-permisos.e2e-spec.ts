import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ROLES } from '../src/autenticacion/usuario-sesion.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Permisos de Fase 1 en todas las secciones implementadas', () => {
  let app: INestApplication;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base.prisma)
      .overrideProvider(VerificadorFirebase).useValue({ verificar: async (token: string) => ({ uid: token }) }).compile();
    app = modulo.createNestApplication(); await app.init();
    for (const rol of ROLES) await base.prisma.usuario.create({ data: { firebase_uid: `matriz-${rol}`, nombre: rol, email: `${rol.toLowerCase()}@matriz.test`, rol, usuario_centro: { create: { centro_venta_id: 1 } } } });
  });
  afterAll(async () => { try { await app?.close(); } finally { await base?.cerrar(); } });

  const rutas: [string, string[]][] = [
    ['/catalogo/productos', ['ADMIN', 'GERENTE']],
    ['/turnos', ['ADMIN', 'GERENTE', 'CAJERO']],
    ['/pedidos', ['ADMIN', 'GERENTE', 'CAJERO', 'MESERO']],
    ['/caja/metodos', ['ADMIN', 'GERENTE', 'CAJERO']],
    ['/reportes/ventas', ['ADMIN', 'GERENTE']],
    ['/usuarios', ['ADMIN']],
  ];
  it.each(ROLES)('el rol %s tiene exactamente las secciones permitidas en la API', async (rol) => {
    for (const [ruta, roles] of rutas) await http().get(ruta).set({ Authorization: `Bearer matriz-${rol}`, 'X-Centro-Id': '1' }).expect(roles.includes(rol) ? 200 : 403);
  });

  it('los roles sin asignación no eligen otro centro y ADMIN sí puede hacerlo', async () => {
    for (const rol of ROLES) await http().get('/sesion').set({ Authorization: `Bearer matriz-${rol}`, 'X-Centro-Id': '2' }).expect(rol === 'ADMIN' ? 200 : 403);
  });
  it('sin centro no se consulta información de ventas ni se cobra; el mesero no registra pagos', async () => {
    for (const ruta of ['/pedidos', '/turnos', '/caja/pendientes', '/reportes/ventas', '/catalogo/productos']) await http().get(ruta).set({ Authorization: 'Bearer matriz-ADMIN' }).expect(400);
    await http().post('/caja/pagos').set({ Authorization: 'Bearer matriz-ADMIN' }).send({}).expect(400);
    for (const rol of ['MESERO', 'COCINA']) await http().post('/caja/pagos').set({ Authorization: `Bearer matriz-${rol}`, 'X-Centro-Id': '1' }).send({}).expect(403);
  });
});
