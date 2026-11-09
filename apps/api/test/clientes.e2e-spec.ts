import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerificadorFirebase } from '../src/autenticacion/verificador-firebase.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

describe('Clientes y papelera conservan ventas y permisos', () => {
  let app: INestApplication,
    db: PrismaService,
    base: Awaited<ReturnType<typeof crearBaseAislada>>;
  let producto: number;
  const usuarios = ['ADMIN', 'GERENTE', 'CAJERO', 'MESERO', 'COCINA'] as const;
  const ids: Record<string, number> = {};
  const h = (rol = 'ADMIN', centro = 1) => ({
    Authorization: `Bearer clientes-${rol}`,
    'X-Centro-Id': String(centro),
  });
  const http = () => request(app.getHttpServer());
  const ficha = (telefono = '5555-1234') => ({
    id: randomUUID(),
    nombre: 'Ana Cliente',
    telefono,
    direccion: 'Zona 1',
  });
  const pedido = (extras = {}) => ({
    id: randomUUID(),
    tipo_venta_id: 2,
    cliente_nombre: 'Ana Cliente',
    lineas: [{ id: randomUUID(), producto_id: producto, cantidad: '1' }],
    ...extras,
  });
  beforeAll(async () => {
    base = await crearBaseAislada();
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(base.prisma)
      .overrideProvider(VerificadorFirebase)
      .useValue({ verificar: async (uid: string) => ({ uid }) })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    for (const rol of usuarios) {
      const u = await db.usuario.create({
        data: {
          firebase_uid: `clientes-${rol}`,
          nombre: `Prueba ${rol}`,
          email: `${rol}@clientes.test`,
          rol,
        },
      });
      ids[rol] = u.id;
      if (rol !== 'ADMIN')
        await db.usuario_centro.create({
          data: { usuario_id: u.id, centro_venta_id: 1 },
        });
    }
    const cat = await db.categoria.create({
      data: { nombre: 'Prueba clientes' },
    });
    producto = (
      await db.producto.create({
        data: {
          categoria_id: cat.id,
          nombre: 'Comida',
          sku: 'CLIENTES-1',
          precio_base: '25',
        },
      })
    ).id;
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await base?.cerrar();
    }
  });
  it('crea sin duplicar reintentos, normaliza teléfono y separa centros', async () => {
    const c = ficha();
    await http().post('/clientes').set(h()).send(c).expect(201);
    await http().post('/clientes').set(h()).send(c).expect(201);
    const r = await http()
      .get('/clientes?buscar=55551234')
      .set(h())
      .expect(200);
    expect(r.body.total).toBe(1);
    expect(r.body.registros[0].id).toBe(c.id);
    await http()
      .post('/clientes')
      .set(h())
      .send({ ...c, id: randomUUID(), telefono: '(5555) 1234' })
      .expect(409);
    await http()
      .post('/clientes')
      .set(h('ADMIN', 2))
      .send({ ...c, id: randomUUID() })
      .expect(201);
    await http().get(`/clientes/${c.id}`).set(h('ADMIN', 2)).expect(404);
    await http().get('/clientes').set(h('GERENTE', 2)).expect(403);
    const resultados = await Promise.all([
      http().post('/clientes').set(h()).send(ficha('5555-7777')),
      http().post('/clientes').set(h()).send(ficha('55557777')),
    ]);
    expect(resultados.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
  });
  it('valida teléfonos/nombre y registra cambios por campo con autor y fecha, sin cambios vacíos', async () => {
    for (const datos of [
      { nombre: '', telefono: '12345678' },
      { nombre: 'Ana', telefono: 'abc' },
      { nombre: 'Ana', telefono: '123' },
    ])
      await http()
        .post('/clientes')
        .set(h())
        .send({ id: randomUUID(), ...datos })
        .expect(400);
    const c = (
      await http()
        .post('/clientes')
        .set(h())
        .send(ficha('55550001'))
        .expect(201)
    ).body;
    const editar = {
      nombre: 'Ana Nueva',
      telefono: c.telefono,
      direccion: 'Zona 2',
      version: c.version,
    };
    await http()
      .patch(`/clientes/${c.id}`)
      .set(h('CAJERO'))
      .send(editar)
      .expect(200);
    await http()
      .patch(`/clientes/${c.id}`)
      .set(h('CAJERO'))
      .send(editar)
      .expect(200);
    await http()
      .patch(`/clientes/${c.id}`)
      .set(h())
      .send({ ...editar, nombre: 'Cambio viejo' })
      .expect(409);
    const cambios = (
      await http().get(`/clientes/${c.id}/cambios`).set(h()).expect(200)
    ).body.registros;
    const edicion = cambios.filter(
      (x: { operacion: string }) => x.operacion === 'EDICION',
    );
    expect(edicion).toHaveLength(2);
    expect(edicion).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campo: 'nombre',
          valor_anterior: 'Ana Cliente',
          valor_nuevo: 'Ana Nueva',
          usuario_id: ids.CAJERO,
          fecha: expect.any(String),
        }),
      ]),
    );
    await http().get(`/clientes/${c.id}/cambios`).set(h('CAJERO')).expect(403);
    await expect(
      db.cliente_cambio.deleteMany({ where: { cliente_id: c.id } }),
    ).rejects.toThrow();
  });
  it('vincula/crea desde venta de forma atómica y conserva la copia histórica', async () => {
    const datos = pedido({
      cliente_telefono: '55550002',
      cliente_direccion: 'Dirección original',
    });
    const p = (await http().post('/pedidos').set(h()).send(datos).expect(201))
      .body;
    expect(p.cliente_id).toBeTruthy();
    await http().post('/pedidos').set(h()).send(datos).expect(201);
    expect(
      await db.cliente.count({ where: { telefono_normalizado: '55550002' } }),
    ).toBe(1);
    const c = await db.cliente.findUniqueOrThrow({
      where: { id: p.cliente_id },
    });
    await http()
      .patch(`/clientes/${c.id}`)
      .set(h())
      .send({
        nombre: 'Otro nombre',
        telefono: c.telefono,
        direccion: 'Nueva dirección',
        version: c.version,
      })
      .expect(200);
    const guardado = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect(guardado.cliente_direccion).toBe('Dirección original');
    expect(guardado.cliente_nombre).toBe('Ana Cliente');
    await http()
      .post('/pedidos')
      .set(h())
      .send(
        pedido({
          cliente_id: c.id,
          cliente_version: 1,
          cliente_telefono: c.telefono,
          cliente_direccion: 'Zona 1',
        }),
      )
      .expect(409);
    await http()
      .post('/pedidos')
      .set(h())
      .send(
        pedido({
          cliente_id: c.id,
          cliente_version: 2,
          cliente_telefono: c.telefono,
          cliente_direccion: 'Zona 1',
        }),
      )
      .expect(409);
    await http()
      .post('/pedidos')
      .set(h())
      .send(
        pedido({
          cliente_id: c.id,
          cliente_version: 2,
          cliente_telefono: c.telefono,
          cliente_direccion: 'Zona 1',
          actualizar_cliente: true,
        }),
      )
      .expect(201);
    const historial = (
      await http().get(`/clientes/${c.id}/pedidos`).set(h()).expect(200)
    ).body;
    expect(historial.total).toBe(2);
    await http().get(`/clientes/${c.id}/pedidos`).set(h('MESERO')).expect(403);
    await http()
      .post('/pedidos')
      .set(h())
      .send(
        pedido({
          cliente_telefono: '55550003',
          lineas: [{ id: randomUUID(), producto_id: 999999, cantidad: '1' }],
        }),
      )
      .expect(400);
    expect(
      await db.cliente.count({ where: { telefono_normalizado: '55550003' } }),
    ).toBe(0);
  });
  it('elimina/restaura clientes solo con gerente/admin, conserva historial y bloquea selección en papelera', async () => {
    const c = (
      await http()
        .post('/clientes')
        .set(h())
        .send(ficha('55550004'))
        .expect(201)
    ).body;
    const ruta = `/papelera/clientes/${c.id}`;
    for (const rol of ['CAJERO', 'MESERO', 'COCINA'])
      await http()
        .post(`${ruta}/eliminacion`)
        .set(h(rol))
        .send({ version: 1, motivo: 'Duplicado' })
        .expect(403);
    await http()
      .post(`${ruta}/eliminacion`)
      .set(h('GERENTE'))
      .send({ version: 1 })
      .expect(400);
    await http()
      .post(`${ruta}/eliminacion`)
      .set(h('GERENTE'))
      .send({ version: 1, motivo: 'Registro de prueba' })
      .expect(201);
    await http()
      .post(`${ruta}/eliminacion`)
      .set(h('GERENTE'))
      .send({ version: 1, motivo: 'Registro de prueba' })
      .expect(201);
    expect(
      (await http().get('/clientes?buscar=55550004').set(h())).body.total,
    ).toBe(0);
    expect(
      (await http().get('/papelera/clientes?buscar=55550004').set(h())).body
        .total,
    ).toBe(1);
    expect((await http().get('/papelera/clientes?buscar=Registro%20de%20prueba').set(h())).body.total).toBe(1);
    expect((await http().get('/papelera/clientes?buscar=GERENTE').set(h())).body.total).toBe(1);
    const retirado = await db.cliente.findUniqueOrThrow({ where: { id: c.id } });
    const diaRetiro = new Date(retirado.eliminado_en!.getTime() - 6 * 3600000).toISOString().slice(0,10);
    expect((await http().get(`/papelera/clientes?fecha=${diaRetiro}`).set(h())).body.total).toBe(1);
    expect((await http().get('/papelera/clientes?fecha=2000-01-01').set(h())).body.total).toBe(0);
    await http().get('/papelera/clientes?fecha=2026-02-31').set(h()).expect(400);
    await http().post('/clientes').set(h()).send(ficha('55550004')).expect(409);
    await http()
      .post('/pedidos')
      .set(h())
      .send(
        pedido({
          cliente_id: c.id,
          cliente_version: 2,
          cliente_telefono: c.telefono,
          cliente_direccion: c.direccion,
        }),
      )
      .expect(409);
    await http()
      .post(`${ruta}/restauracion`)
      .set(h('GERENTE'))
      .send({ version: 2 })
      .expect(201);
    await http()
      .post(`${ruta}/restauracion`)
      .set(h('GERENTE'))
      .send({ version: 2 })
      .expect(201);
    expect(
      (await http().get('/clientes?buscar=55550004').set(h())).body.total,
    ).toBe(1);
  });
  it('papelera de pedidos exige finalización, conserva totales/pagos/folio y restaura solo visibilidad', async () => {
    const p = (
      await http().post('/pedidos').set(h()).send(pedido()).expect(201)
    ).body;
    let actual = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
    const ruta = `/papelera/pedidos/${p.id}`;
    await http()
      .post(`${ruta}/eliminacion`)
      .set(h())
      .send({ version: actual.version, motivo: 'Prueba' })
      .expect(409);
    await http()
      .post(`/pedidos/${p.id}/anulacion`)
      .set(h())
      .send({ motivo: 'Cliente canceló' })
      .expect(201);
    actual = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
    await http()
      .post(`${ruta}/eliminacion`)
      .set(h())
      .send({ version: actual.version, motivo: 'Prueba' })
      .expect(201);
    expect(
      (await http().get('/pedidos').set(h())).body.some(
        (x: { id: string }) => x.id === p.id,
      ),
    ).toBe(false);
    expect(
      (
        await http().get(`/papelera/pedidos?buscar=${p.folio}`).set(h())
      ).body.registros.some((x: { id: string }) => x.id === p.id),
    ).toBe(true);
    const oculto = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect(oculto.total.equals(actual.total)).toBe(true);
    expect(oculto.folio).toBe(actual.folio);
    await http()
      .post(`${ruta}/restauracion`)
      .set(h())
      .send({ version: oculto.version })
      .expect(201);
    expect(
      (await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).estado,
    ).toBe('ANULADO');
    const pagado = (
      await http().post('/pedidos').set(h()).send(pedido()).expect(201)
    ).body;
    const turno = await db.turno_caja.findFirstOrThrow({
      where: { centro_venta_id: 1, estado: 'ABIERTO' },
    });
    const efectivo = await db.metodo_pago.findFirstOrThrow({
      where: { codigo: 'EFECTIVO' },
    });
    await db.pago.create({
      data: {
        id: randomUUID(),
        pedido_id: pagado.id,
        turno_id: turno.id,
        metodo_pago_id: efectivo.id,
        monto: '25',
        registrado_por: ids.ADMIN,
      },
    });
    let pp = await db.pedido.findUniqueOrThrow({ where: { id: pagado.id } });
    await http()
      .post(`/papelera/pedidos/${pp.id}/eliminacion`)
      .set(h())
      .send({ version: pp.version, motivo: 'Archivar' })
      .expect(409);
    await db.pedido.update({
      where: { id: pp.id },
      data: { estado_cocina: 'ENTREGADO' },
    });
    pp = await db.pedido.findUniqueOrThrow({ where: { id: pp.id } });
    const antes = (await http().get('/reportes/ventas').set(h()).expect(200))
      .body;
    await http()
      .post(`/papelera/pedidos/${pp.id}/eliminacion`)
      .set(h())
      .send({ version: pp.version, motivo: 'Archivar' })
      .expect(201);
    const despues = (await http().get('/reportes/ventas').set(h()).expect(200))
      .body;
    expect(despues.resumen).toEqual(antes.resumen);
    expect(despues.por_pago).toEqual(antes.por_pago);
    expect(
      despues.pedidos.find((x: { id: string }) => x.id === pp.id),
    ).toMatchObject({ en_papelera: true });
    expect(
      await db.pago.count({ where: { pedido_id: pp.id, estado: 'APLICADO' } }),
    ).toBe(1);
    expect(
      (await http().get(`/caja/pedidos/${pp.id}/comprobante`).set(h())).status,
    ).not.toBe(500);
  });
  it('restricciones individuales también bloquean acciones cruzadas de papelera y ventas', async () => {
    await db.permiso_usuario.create({
      data: {
        usuario_id: ids.GERENTE,
        modulo: 'clientes',
        accion: 'anular',
        permitido: false,
      },
    });
    const c = (await http().post('/clientes').set(h()).send(ficha('55550009')))
      .body;
    await http()
      .post(`/papelera/clientes/${c.id}/eliminacion`)
      .set(h('GERENTE'))
      .send({ version: c.version, motivo: 'Prueba' })
      .expect(403);
    await db.permiso_usuario.create({
      data: {
        usuario_id: ids.CAJERO,
        modulo: 'clientes',
        accion: 'crear',
        permitido: false,
      },
    });
    await http()
      .post('/pedidos')
      .set(h('CAJERO'))
      .send(pedido({ cliente_telefono: '55550010' }))
      .expect(403);
    await http().get('/clientes').set(h('COCINA')).expect(403);
  });
});
