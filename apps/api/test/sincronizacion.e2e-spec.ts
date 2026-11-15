import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

// Tarea 18: los 8 casos del modo sin internet de la especificación.
describe('Sincronización sin internet (base aislada)', () => {
  let app: INestApplication;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  const http = () => request(app.getHttpServer());
  const cajero = { Authorization: 'Bearer uid-cajero-01', 'X-Centro-Id': '1' };
  const gerente = { Authorization: 'Bearer sync-gerente', 'X-Centro-Id': '1' };
  let n = 0;
  const pedido = (extra: object = {}) => ({ id: randomUUID(), tipo_venta_id: 2, cliente_nombre: 'Mostrador', creado_en: new Date(Date.now() - 2000).toISOString(), folio_offline: `CAJA1-${String(++n).padStart(4, '0')}`, lineas: [{ id: randomUUID(), producto_id: 1, cantidad: 1 }], ...extra });
  const pago = (pedidoId: string, extra: object = {}) => ({ id: randomUUID(), pedido_id: pedidoId, metodo_pago_id: 1, monto: '45.00', registrado_en: new Date(Date.now() - 1000).toISOString(), ...extra });
  const enviar = async (operaciones: { tipo: string; datos: object }[], dispositivo = 1) =>
    (await http().post('/sincronizacion').set(cajero).send({ dispositivo_id: dispositivo, operaciones }).expect(201)).body.resultados as { resultado: string; folio?: number; motivo?: string }[];

  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base.prisma)
      .overrideProvider(VerificadorFirebase).useValue({ verificar: async (token: string) => ({ uid: token }) }).compile();
    app = modulo.createNestApplication(); await app.init();
    // El turno de la base de pruebas se abrió hace una hora (evita depender del reloj de Docker).
    await base.prisma.turno_caja.updateMany({ data: { abierto_en: new Date(Date.now() - 3600000) } });
    await base.prisma.usuario.create({ data: { firebase_uid: 'sync-gerente', nombre: 'Gerente', email: 'sync-g@prueba.test', rol: 'GERENTE', usuario_centro: { create: { centro_venta_id: 1 } } } });
  }, 20000);
  afterAll(async () => { try { await app?.close(); } finally { await base?.cerrar(); } });

  it('1 y 2 · reenviar un pedido o un pago no los duplica ni gasta folio; guarda la hora del dispositivo y los dos folios', async () => {
    const p = pedido();
    const pg = pago(p.id);
    const [r1, r2] = await enviar([{ tipo: 'PEDIDO', datos: p }, { tipo: 'PAGO', datos: pg }]);
    expect(r1).toMatchObject({ resultado: 'APLICADO', folio: expect.any(Number) });
    expect(r2).toMatchObject({ resultado: 'APLICADO' });
    const [o1, o2] = await enviar([{ tipo: 'PEDIDO', datos: p }, { tipo: 'PAGO', datos: pg }]);
    expect(o1).toMatchObject({ resultado: 'YA_EXISTIA', folio: r1.folio });
    expect(o2.resultado).toBe('YA_EXISTIA');
    const guardado = await base.prisma.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect(guardado).toMatchObject({ estado: 'PAGADO', origen: 'SIN_INTERNET', folio_offline: p.folio_offline, creado_por: 2 });
    expect(guardado.creado_en.toISOString()).toBe(p.creado_en);
    expect(await base.prisma.pago.count({ where: { pedido_id: p.id } })).toBe(1);
    const siguiente = (await http().post('/pedidos').set(cajero).send({ id: randomUUID(), tipo_venta_id: 2, cliente_nombre: 'En línea', lineas: [{ id: randomUUID(), producto_id: 1, cantidad: 1 }] }).expect(201)).body;
    expect(siguiente.folio).toBe((r1.folio ?? 0) + 1);
  });

  it('3 · un producto agregado sin internet a un pedido que la caja ya cobró va a la bandeja', async () => {
    const p = pedido();
    await enviar([{ tipo: 'PEDIDO', datos: p }, { tipo: 'PAGO', datos: pago(p.id) }]);
    const [r] = await enviar([{ tipo: 'PEDIDO', datos: { ...p, lineas: [{ id: randomUUID(), producto_id: 2, cantidad: 1 }] } }]);
    expect(r.resultado).toBe('CONFLICTO_PARCIAL');
    expect(r.motivo).toBeTruthy();
  });

  it('4 · un voucher repetido va a la bandeja', async () => {
    const a = pedido(), b = pedido();
    const tarjeta = { metodo_pago_id: 2, terminal_pos: 'T1', referencia_pos: 'VOUCHER-1' };
    const r = await enviar([{ tipo: 'PEDIDO', datos: a }, { tipo: 'PAGO', datos: pago(a.id, tarjeta) }, { tipo: 'PEDIDO', datos: b }, { tipo: 'PAGO', datos: pago(b.id, tarjeta) }]);
    expect(r.map((x) => x.resultado)).toEqual(['APLICADO', 'APLICADO', 'APLICADO', 'CONFLICTO']);
    expect(r[3].motivo).toMatch(/voucher/i);
  });

  it('5 · el pago de un pedido que nunca llegó va a la bandeja', async () => {
    const [r] = await enviar([{ tipo: 'PAGO', datos: pago(randomUUID()) }]);
    expect(r.resultado).toBe('CONFLICTO');
  });

  it('6 · una tablet desactivada manda todo a la bandeja', async () => {
    await base.prisma.dispositivo.update({ where: { id: 2 }, data: { activo: false } });
    try {
      const [r] = await enviar([{ tipo: 'PEDIDO', datos: pedido({ folio_offline: 'TAB01-0001' }) }], 2);
      expect(r).toMatchObject({ resultado: 'CONFLICTO', motivo: 'Dispositivo desactivado' });
    } finally { await base.prisma.dispositivo.update({ where: { id: 2 }, data: { activo: true } }); }
  });

  it('7 y 8 · un pedido sin folio provisional va a la bandeja y reenviarlo no repite el conflicto', async () => {
    const p = pedido({ folio_offline: null });
    const [r] = await enviar([{ tipo: 'PEDIDO', datos: p }]);
    expect(r.resultado).toBe('CONFLICTO');
    const antes = await base.prisma.sync_conflicto.count();
    const [otra] = await enviar([{ tipo: 'PEDIDO', datos: p }]);
    expect(otra.resultado).toBe('YA_EN_CONFLICTO');
    expect(await base.prisma.sync_conflicto.count()).toBe(antes);
  });

  it('el gerente ve la bandeja con motivos claros y la resuelve; el cajero no', async () => {
    await http().get('/sincronizacion/conflictos').set(cajero).expect(403);
    const bandeja = (await http().get('/sincronizacion/conflictos').set(gerente).expect(200)).body;
    expect(bandeja.conflictos.length).toBeGreaterThanOrEqual(5);
    const primero = bandeja.conflictos[0];
    expect(primero).toMatchObject({ dispositivo: expect.any(String), motivo: expect.any(String) });
    await http().post(`/sincronizacion/conflictos/${primero.id}`).set(gerente).send({ estado: 'RESUELTO', nota: '' }).expect(400);
    await http().post(`/sincronizacion/conflictos/${primero.id}`).set(gerente).send({ estado: 'RESUELTO', nota: 'Se cobró en línea' }).expect(201);
    await http().post(`/sincronizacion/conflictos/${primero.id}`).set(gerente).send({ estado: 'RESUELTO', nota: 'Otra vez' }).expect(404);
  });

  it('rechaza un equipo de otro centro y horas del futuro', async () => {
    await http().post('/sincronizacion').set(cajero).send({ dispositivo_id: 999, operaciones: [{ tipo: 'PEDIDO', datos: pedido() }] }).expect(400);
    await http().post('/sincronizacion').set(cajero).send({ dispositivo_id: 1, operaciones: [{ tipo: 'PEDIDO', datos: pedido({ creado_en: new Date(Date.now() + 86400000).toISOString() }) }] }).expect(400);
  });
});
