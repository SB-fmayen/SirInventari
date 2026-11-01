import { HttpStatus } from '@nestjs/common';
import { traducirErrorBd } from './errores-bd.js';

/** Imita el error que Prisma 7 entrega cuando falla PostgreSQL. */
function errorPrisma(originalCode: string, originalMessage: string, constraint?: object) {
  return {
    name: 'PrismaClientKnownRequestError',
    code: 'P2010',
    meta: { driverAdapterError: { cause: { originalCode, originalMessage, constraint } } },
  };
}

describe('traducirErrorBd', () => {
  it('deja pasar el mensaje en español de un trigger', () => {
    const r = traducirErrorBd(errorPrisma('P0001', 'El pedido ya está PAGADO y no admite más cobros'));
    expect(r).toEqual({
      estado: HttpStatus.UNPROCESSABLE_ENTITY,
      mensaje: 'El pedido ya está PAGADO y no admite más cobros',
    });
  });

  it('traduce el voucher repetido', () => {
    const r = traducirErrorBd(
      errorPrisma('23505', 'duplicate key value violates unique constraint "uq_pago_voucher"', {
        index: 'uq_pago_voucher',
      }),
    );
    expect(r?.estado).toBe(HttpStatus.CONFLICT);
    expect(r?.mensaje).toBe('El número de autorización del voucher ya se usó en otro pago.');
  });

  it('traduce el segundo turno abierto aunque el nombre solo venga en el mensaje', () => {
    const r = traducirErrorBd(
      errorPrisma('23505', 'duplicate key value violates unique constraint "uq_turno_abierto"'),
    );
    expect(r?.mensaje).toBe('Ya hay un turno de caja abierto en este centro de venta.');
  });

  it('usa un mensaje general para otros datos repetidos', () => {
    expect(traducirErrorBd(errorPrisma('23505', 'x', { index: 'pago_pkey' }))?.mensaje).toBe(
      'Ese registro ya existe.',
    );
    expect(traducirErrorBd(errorPrisma('23505', 'x', { index: 'otro' }))?.mensaje).toBe(
      'Ya existe un registro con esos datos.',
    );
  });

  it('traduce reglas CHECK, datos faltantes y referencias inexistentes', () => {
    expect(
      traducirErrorBd(errorPrisma('23514', 'violates check constraint "pago_monto_check"'))?.mensaje,
    ).toBe('El monto del pago debe ser mayor que cero.');
    expect(traducirErrorBd(errorPrisma('23502', 'null value'))?.mensaje).toBe(
      'Falta un dato obligatorio.',
    );
    expect(traducirErrorBd(errorPrisma('23503', 'fk'))?.estado).toBe(HttpStatus.BAD_REQUEST);
  });

  it('avisa cuando no hay conexión con la base', () => {
    const r = traducirErrorBd({ name: 'PrismaClientInitializationError', message: 'x' });
    expect(r?.estado).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('devuelve null si el error no viene de la base', () => {
    expect(traducirErrorBd(new Error('otra cosa'))).toBeNull();
    expect(traducirErrorBd(null)).toBeNull();
  });
});
