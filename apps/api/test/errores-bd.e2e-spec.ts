import { construirRespuestaError } from '../src/comun/filtro-errores.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearBaseAislada } from './base-aislada.js';

/**
 * Provoca errores reales en la base (sin dejar datos) y revisa que el usuario
 * reciba un mensaje claro en español. Usa db/02_datos_iniciales.sql.
 */
describe('Errores reales de la base traducidos (e2e)', () => {
  let prisma: PrismaService;
  let base: Awaited<ReturnType<typeof crearBaseAislada>>;

  beforeAll(async () => {
    base = await crearBaseAislada();
    prisma = base.prisma;
  });

  afterAll(async () => {
    await base?.cerrar();
  });

  async function errorDe(operacion: () => Promise<unknown>) {
    try {
      await operacion();
    } catch (e) {
      return construirRespuestaError(e);
    }
    throw new Error('Se esperaba que la operación fallara');
  }

  it('segundo turno abierto en el mismo centro', async () => {
    const r = await errorDe(() =>
      prisma.turno_caja.create({ data: { centro_venta_id: 1, abierto_por: 2 } }),
    );
    expect(r).toEqual({
      statusCode: 409,
      mensaje: 'Ya hay un turno de caja abierto en este centro de venta.',
    });
  });

  it('mensaje de un trigger: pago de un pedido que no existe', async () => {
    const r = await errorDe(() =>
      prisma.pago.create({
        data: {
          id: '00000000-0000-0000-0000-000000000001',
          pedido_id: '00000000-0000-0000-0000-0000000000ff',
          metodo_pago_id: 1,
          turno_id: 1,
          monto: 5,
          registrado_por: 2,
        },
      }),
    );
    expect(r).toEqual({
      statusCode: 422,
      mensaje: 'El pedido de este pago no está en la nube (no llegó o quedó en conflicto)',
    });
  });

  it('voucher repetido dentro de una transacción que se deshace', async () => {
    const DESHACER = new Error('deshacer');
    let respuesta: ReturnType<typeof construirRespuestaError> | undefined;
    await prisma
      .$transaction(async (tx) => {
        const pedidos = ['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'];
        for (const [i, id] of pedidos.entries()) {
          await tx.$executeRaw`
            INSERT INTO pedido (id, centro_venta_id, folio, tipo_venta_id, turno_id, creado_por)
            VALUES (${id}::uuid, 1, siguiente_folio(1::smallint, fecha_guatemala()), 1, 1, 2)`;
          await tx.$executeRaw`
            INSERT INTO pedido_detalle (id, pedido_id, producto_id, cantidad, precio_unitario, agregado_por)
            VALUES (${`20000000-0000-0000-0000-00000000000${i}`}::uuid, ${id}::uuid, 1, 1, 45, 2)`;
        }
        await tx.$executeRaw`
          INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, monto, terminal_pos, referencia_pos, registrado_por)
          VALUES ('30000000-0000-0000-0000-000000000001', ${pedidos[0]}::uuid, 2, 1, 45, 'TERM-01', 'E2E001', 2)`;
        try {
          await tx.$executeRaw`SAVEPOINT intento`;
          await tx.$executeRaw`
            INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, monto, terminal_pos, referencia_pos, registrado_por)
            VALUES ('30000000-0000-0000-0000-000000000002', ${pedidos[1]}::uuid, 2, 1, 45, 'term-01', 'e2e 001', 2)`;
        } catch (e) {
          respuesta = construirRespuestaError(e);
        }
        throw DESHACER;
      })
      .catch((e) => {
        if (e !== DESHACER) throw e;
      });

    expect(respuesta).toEqual({
      statusCode: 409,
      mensaje: 'El número de autorización del voucher ya se usó en otro pago.',
    });
    // No quedó nada guardado
    expect(await prisma.pago.count({ where: { referencia_pos: 'E2E001' } })).toBe(0);
  });
});
