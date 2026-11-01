import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

describe('API (e2e, con la base de Docker)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /salud dice que la API y la base funcionan', async () => {
    const res = await request(app.getHttpServer()).get('/salud').expect(200);
    expect(res.body).toMatchObject({
      api: 'ok',
      baseDatos: 'ok',
      zonaHoraria: 'America/Guatemala',
      mensaje: 'La API y la base de datos funcionan.',
    });
    expect(res.body.fechaOperacion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('una ruta que no existe responde en español', async () => {
    const res = await request(app.getHttpServer()).get('/no-existe').expect(404);
    expect(res.body).toEqual({ statusCode: 404, mensaje: 'No se encontró lo que buscas.' });
  });
});
