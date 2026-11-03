import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Mejoras aprobadas: controles y permisos', () => {
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;
  let app: INestApplication;
  let p: PrismaService;
  let admin: number;
  let cajero: number;
  const token = randomUUID();
  const caja = randomUUID();
  const http = () => request(app.getHttpServer());
  const h = (u = token, centro = 1) => ({
    Authorization: `Bearer ${u}`,
    'X-Centro-Id': String(centro),
  });
  beforeAll(async () => {
    base = await crearBaseAislada();
    p = base.prisma;
    admin = (
      await p.usuario.create({
        data: {
          firebase_uid: token,
          email: `${token}@test.com`,
          nombre: 'Admin mejoras',
          rol: 'ADMIN',
        },
      })
    ).id;
    cajero = (
      await p.usuario.create({
        data: {
          firebase_uid: caja,
          email: `${caja}@test.com`,
          nombre: 'Caja mejoras',
          rol: 'CAJERO',
          usuario_centro: { create: { centro_venta_id: 1 } },
        },
      })
    ).id;
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(p)
      .overrideProvider(VerificadorFirebase)
      .useValue({ verificar: async (uid: string) => ({ uid }) })
      .compile();
    app = m.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await base?.cerrar();
    }
  });

  it('dos cambios concurrentes de rol conservan un administrador activo', async () => {
    const otros = await p.usuario.findMany({
      where: { rol: 'ADMIN', activo: true, id: { not: admin } },
    });
    for (const u of otros)
      await p.usuario.update({ where: { id: u.id }, data: { activo: false } });
    const segundo = await p.usuario.create({
      data: {
        firebase_uid: randomUUID(),
        email: `${randomUUID()}@test.com`,
        nombre: 'Segundo admin',
        rol: 'ADMIN',
      },
    });
    const rs = await Promise.all(
      [admin, segundo.id].map((id) =>
        http()
          .patch(`/usuarios/${id}`)
          .set(h())
          .send({ rol: 'GERENTE', centros: [1] }),
      ),
    );
    expect(rs.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(
      await p.usuario.count({ where: { rol: 'ADMIN', activo: true } }),
    ).toBe(1);
    await p.usuario.update({
      where: { id: admin },
      data: { rol: 'ADMIN', activo: true },
    });
  });

  it('el permiso específico bloquea la API y no concede módulos fuera del rol', async () => {
    await http()
      .patch(`/control/permisos/${cajero}`)
      .set(h())
      .send({
        permisos: [
          { modulo: 'caja', accion: 'crear', permitido: false },
          { modulo: 'usuarios', accion: 'ver', permitido: true },
        ],
      })
      .expect(200);
    await http().post('/caja/pagos').set(h(caja)).send({}).expect(403);
    await http().get('/usuarios').set(h(caja)).expect(403);
    await http().get('/caja/pendientes').set(h(caja)).expect(200);
    await http().get('/caja/pendientes').set(h(caja, 2)).expect(403);
    await http()
      .patch(`/control/permisos/${cajero}`)
      .set(h())
      .send({ permisos: [] })
      .expect(200);
  });

  it('cortesía requiere autorización y se reintenta sin duplicar ni crear pagos cero', async () => {
    const pedido = await http()
      .post('/pedidos')
      .set(h(caja))
      .send({
        id: randomUUID(),
        tipo_venta_id: 1,
        mesa_referencia: 'Prueba',
        lineas: [{ id: randomUUID(), producto_id: 1, cantidad: '1' }],
      })
      .expect(201);
    const solicitud = {
      id: randomUUID(),
      pedido_id: pedido.body.id,
      tipo: 'CORTESIA',
      motivo: 'Atención al cliente',
    };
    const s = await http()
      .post('/control/solicitudes')
      .set(h(caja))
      .send(solicitud)
      .expect(201);
    await http()
      .post(`/control/solicitudes/${s.body.id}/resolver`)
      .set(h(caja))
      .send({ aprobar: true })
      .expect(403);
    await http()
      .post(`/control/solicitudes/${s.body.id}/resolver`)
      .set(h())
      .send({ aprobar: true })
      .expect(201);
    await http()
      .post(`/control/solicitudes/${s.body.id}/resolver`)
      .set(h())
      .send({ aprobar: true })
      .expect(201);
    const final = await p.pedido.findUniqueOrThrow({
      where: { id: pedido.body.id },
    });
    expect(final.estado).toBe('PAGADO');
    expect(final.total.toString()).toBe('0');
    expect(final.cortesia_por).toBe(admin);
    expect(await p.pago.count({ where: { pedido_id: final.id } })).toBe(0);
    expect(
      await p.solicitud_autorizacion.count({ where: { pedido_id: final.id } }),
    ).toBe(1);
    await http().delete('/control/productos/1').set(h()).expect(409);
  });

  it('elimina solo usuarios desactivados sin historial y rechaza eliminarse a sí mismo', async () => {
    const u = await p.usuario.create({
      data: {
        firebase_uid: randomUUID(),
        email: `${randomUUID()}@test.com`,
        nombre: 'Error de registro',
        rol: 'MESERO',
        activo: false,
      },
    });
    await http().delete(`/control/usuarios/${u.id}`).set(h()).expect(200);
    expect(await p.usuario.findUnique({ where: { id: u.id } })).toBeNull();
    await http().delete(`/control/usuarios/${admin}`).set(h()).expect(409);
    await http().delete(`/control/usuarios/${cajero}`).set(h()).expect(409);
  });

  it('los ingresos y retiros se reintentan sin duplicar y no permiten sobregirar la caja', async () => {
    const turno = await p.turno_caja.findFirstOrThrow({
      where: { centro_venta_id: 1, estado: 'ABIERTO' },
    });
    const ingreso = {
      id: randomUUID(),
      tipo: 'INGRESO',
      monto: '50.10',
      motivo: 'Cambio para caja',
    };
    await http()
      .post(`/turnos/${turno.id}/movimientos`)
      .set(h(caja))
      .send(ingreso)
      .expect(201);
    await http()
      .post(`/turnos/${turno.id}/movimientos`)
      .set(h(caja))
      .send(ingreso)
      .expect(201);
    await http()
      .post(`/turnos/${turno.id}/movimientos`)
      .set(h(caja))
      .send({ ...ingreso, monto: '51' })
      .expect(409);
    await http()
      .post(`/turnos/${turno.id}/movimientos`)
      .set(h(caja))
      .send({
        id: randomUUID(),
        tipo: 'RETIRO',
        monto: '30.05',
        motivo: 'Retiro supervisado',
      })
      .expect(201);
    await http()
      .post(`/turnos/${turno.id}/movimientos`)
      .set(h(caja))
      .send({
        id: randomUUID(),
        tipo: 'RETIRO',
        monto: '99999999',
        motivo: 'No alcanza',
      })
      .expect(409);
    const lista = await http().get('/turnos').set(h(caja)).expect(200);
    expect(
      lista.body.find((t: { id: number }) => t.id === turno.id),
    ).toMatchObject({
      movimientos_total: '20.05',
      efectivo_esperado: '220.05',
    });
    expect(
      await p.movimiento_caja.count({ where: { turno_id: turno.id } }),
    ).toBe(2);
  });

  it('cambios de precio son atómicos ante una vista previa desactualizada', async () => {
    const productos = await p.producto.findMany({
      orderBy: { id: 'asc' },
      take: 2,
    });
    const cambios = productos.map((x) => ({
      producto_id: x.id,
      anterior: x.precio_base.toFixed(2),
      nuevo: '22.25',
    }));
    await http()
      .post('/catalogo/precios')
      .set(h())
      .send({
        alcance: 'base',
        precios: [cambios[0], { ...cambios[1], anterior: '0.01' }],
      })
      .expect(409);
    expect(
      (
        await p.producto.findUniqueOrThrow({ where: { id: productos[0].id } })
      ).precio_base.equals(productos[0].precio_base),
    ).toBe(true);
    await http()
      .post('/catalogo/precios')
      .set(h())
      .send({ alcance: 'base', precios: cambios })
      .expect(201);
    await http()
      .post('/catalogo/precios')
      .set(h())
      .send({ alcance: 'base', precios: cambios })
      .expect(409);
    await http()
      .post('/catalogo/precios')
      .set(h(caja))
      .send({ alcance: 'base', precios: cambios })
      .expect(403);
    await http()
      .patch('/catalogo/productos/1')
      .set(h())
      .send({ foto_datos: 'data:image/svg+xml;base64,PHN2Zz4=' })
      .expect(400);
    const foto =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0k8AAAAASUVORK5CYII=';
    await http()
      .patch('/catalogo/productos/1')
      .set(h())
      .send({
        foto_datos: foto,
        grupo_variantes: 'Tamaños de prueba',
        es_complemento: true,
      })
      .expect(200);
    const menu = await http().get('/pedidos/catalogo').set(h(caja)).expect(200);
    expect(menu.body.find((x: { id: number }) => x.id === 1)).toMatchObject({
      foto_datos: foto,
      grupo_variantes: 'Tamaños de prueba',
      es_complemento: true,
    });
  });

  it('una anulación autorizada reabre saldo sin borrar el pago ni devolver dinero al POS', async () => {
    const pedido = await http()
      .post('/pedidos')
      .set(h(caja))
      .send({
        id: randomUUID(),
        tipo_venta_id: 1,
        mesa_referencia: 'Pago prueba',
        lineas: [{ id: randomUUID(), producto_id: 1, cantidad: '1' }],
      })
      .expect(201);
    const pago = await http()
      .post('/caja/pagos')
      .set(h(caja))
      .send({
        id: randomUUID(),
        pedido_id: pedido.body.id,
        metodo_pago_id: 1,
        monto: '10',
        recibido: '10',
      })
      .expect(201);
    const s = await http()
      .post('/control/solicitudes')
      .set(h(caja))
      .send({
        id: randomUUID(),
        pedido_id: pedido.body.id,
        tipo: 'ANULAR_PAGO',
        referencia: pago.body.pago.id,
        motivo: 'Corregir forma de pago; POS revisado por separado',
      })
      .expect(201);
    await http()
      .post(`/control/solicitudes/${s.body.id}/resolver`)
      .set(h())
      .send({ aprobar: true })
      .expect(201);
    await http()
      .post(`/control/solicitudes/${s.body.id}/resolver`)
      .set(h())
      .send({ aprobar: true })
      .expect(201);
    const guardado = await p.pago.findUniqueOrThrow({
      where: { id: pago.body.pago.id },
    });
    expect(guardado.estado).toBe('ANULADO');
    expect(guardado.anulado_por).toBe(admin);
    const c = await http()
      .get(`/caja/pedidos/${pedido.body.id}/comprobante`)
      .set(h(caja))
      .expect(200);
    expect(c.body.pedido.pagado).toBe('0.00');
    expect(c.body.pedido.saldo).toBe('22.25');
  });

  it('rechaza autorizaciones de otro centro y correcciones basadas en una versión antigua', async () => {
    const pedido = await http()
      .post('/pedidos')
      .set(h(caja))
      .send({
        id: randomUUID(),
        tipo_venta_id: 1,
        mesa_referencia: 'Cocina prueba',
        lineas: [{ id: randomUUID(), producto_id: 1, cantidad: '1' }],
      })
      .expect(201);
    await p.pedido.update({
      where: { id: pedido.body.id },
      data: { estado_cocina: 'EN_PREPARACION', version: { increment: 1 } },
    });
    const s = await http()
      .post('/control/solicitudes')
      .set(h())
      .send({
        id: randomUUID(),
        pedido_id: pedido.body.id,
        tipo: 'RETROCEDER_COCINA',
        motivo: 'Toque accidental',
      })
      .expect(201);
    await http()
      .post(`/control/solicitudes/${s.body.id}/resolver`)
      .set(h(token, 2))
      .send({ aprobar: true })
      .expect(404);
    await p.pedido.update({
      where: { id: pedido.body.id },
      data: { version: { increment: 1 } },
    });
    await http()
      .post(`/control/solicitudes/${s.body.id}/resolver`)
      .set(h())
      .send({ aprobar: true })
      .expect(409);
    expect(
      (await p.pedido.findUniqueOrThrow({ where: { id: pedido.body.id } }))
        .estado_cocina,
    ).toBe('EN_PREPARACION');
    await http()
      .post(`/control/solicitudes/${s.body.id}/resolver`)
      .set(h())
      .send({ aprobar: false })
      .expect(201);
    const nueva = await http()
      .post('/control/solicitudes')
      .set(h())
      .send({
        id: randomUUID(),
        pedido_id: pedido.body.id,
        tipo: 'RETROCEDER_COCINA',
        motivo: 'Revisado nuevamente',
      })
      .expect(201);
    await http()
      .post(`/control/solicitudes/${nueva.body.id}/resolver`)
      .set(h())
      .send({ aprobar: true })
      .expect(201);
    expect(
      (await p.pedido.findUniqueOrThrow({ where: { id: pedido.body.id } }))
        .estado_cocina,
    ).toBe('PENDIENTE');
  });

  it('consulta pedidos abiertos anteriores y consolida solo los centros autorizados', async () => {
    const pedido = await http()
      .post('/pedidos')
      .set(h(caja))
      .send({
        id: randomUUID(),
        tipo_venta_id: 1,
        mesa_referencia: 'Anterior',
        lineas: [{ id: randomUUID(), producto_id: 1, cantidad: '1' }],
      })
      .expect(201);
    await p.$executeRaw`UPDATE ventas.pedido SET fecha_operacion=ventas.fecha_guatemala()-1 WHERE id=${pedido.body.id}::uuid`;
    const dia = await http().get('/pedidos').set(h(caja)).expect(200);
    expect(dia.body.some((x: { id: string }) => x.id === pedido.body.id)).toBe(
      false,
    );
    const todos = await http()
      .get('/pedidos?anteriores=1')
      .set(h(caja))
      .expect(200);
    expect(
      todos.body.some((x: { id: string }) => x.id === pedido.body.id),
    ).toBe(true);
    await p.usuario.update({ where: { id: cajero }, data: { rol: 'GERENTE' } });
    const control = await http()
      .get('/reportes/control?todos=1')
      .set(h(caja))
      .expect(200);
    expect(control.body.por_centro.map((c: { id: number }) => c.id)).toEqual([
      1,
    ]);
    expect(control.body.resumen.ventas_pagadas).toBe('0.00');
    expect(
      control.body.excepciones.some(
        (e: { tipo: string }) => e.tipo === 'Cortesía',
      ),
    ).toBe(true);
    expect(control.body.comparacion.desde).toBeDefined();
    await http().get('/reportes/control?desde=2026-02-30').set(h()).expect(400);
  });

  it('dos retiros simultáneos no sobregiran y un turno cerrado rechaza movimientos nuevos', async () => {
    const centro = await p.centro_venta.create({
      data: { codigo: 'MOVPRUEBA', nombre: 'Prueba concurrente' },
    });
    const turno = await http()
      .post('/turnos')
      .set(h(token, centro.id))
      .send({ fondo_inicial: '100' })
      .expect(201);
    const a = {
        id: randomUUID(),
        tipo: 'RETIRO',
        monto: '70',
        motivo: 'Retiro uno',
      },
      b = { ...a, id: randomUUID(), motivo: 'Retiro dos' };
    const respuestas = await Promise.all(
      [a, b].map((m) =>
        http()
          .post(`/turnos/${turno.body.id}/movimientos`)
          .set(h(token, centro.id))
          .send(m),
      ),
    );
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const cierre = await http()
      .post(`/turnos/${turno.body.id}/cierre`)
      .set(h(token, centro.id))
      .send({ efectivo_contado: '30' })
      .expect(201);
    expect(cierre.body.efectivo_esperado).toBe('30.00');
    await http()
      .post(`/turnos/${turno.body.id}/movimientos`)
      .set(h(token, centro.id))
      .send({
        id: randomUUID(),
        tipo: 'INGRESO',
        monto: '1',
        motivo: 'Cerrado',
      })
      .expect(409);
  });

  it('no altera un cierre histórico al intentar anular un pago de turno cerrado', async () => {
    const turno = await http()
      .post('/turnos')
      .set(h(token, 2))
      .send({ fondo_inicial: '0' })
      .expect(201);
    const pedido = await http()
      .post('/pedidos')
      .set(h(token, 2))
      .send({
        id: randomUUID(),
        tipo_venta_id: 1,
        mesa_referencia: 'Cierre',
        lineas: [{ id: randomUUID(), producto_id: 1, cantidad: '1' }],
      })
      .expect(201);
    const pago = await http()
      .post('/caja/pagos')
      .set(h(token, 2))
      .send({
        id: randomUUID(),
        pedido_id: pedido.body.id,
        metodo_pago_id: 1,
        monto: '22.25',
        recibido: '22.25',
      })
      .expect(201);
    const solicitud = await http()
      .post('/control/solicitudes')
      .set(h(token, 2))
      .send({
        id: randomUUID(),
        pedido_id: pedido.body.id,
        tipo: 'ANULAR_PAGO',
        referencia: pago.body.pago.id,
        motivo: 'Corrección luego del cierre',
      })
      .expect(201);
    await http()
      .post(`/turnos/${turno.body.id}/cierre`)
      .set(h(token, 2))
      .send({ efectivo_contado: '22.25' })
      .expect(201);
    await http()
      .post(`/control/solicitudes/${solicitud.body.id}/resolver`)
      .set(h(token, 2))
      .send({ aprobar: true })
      .expect(409);
    expect(
      (await p.pago.findUniqueOrThrow({ where: { id: pago.body.pago.id } }))
        .estado,
    ).toBe('APLICADO');
  });
});
