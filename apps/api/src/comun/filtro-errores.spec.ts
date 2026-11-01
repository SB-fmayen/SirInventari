import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { construirRespuestaError } from './filtro-errores.js';

describe('construirRespuestaError', () => {
  it('cambia a español los textos por defecto de NestJS', () => {
    expect(construirRespuestaError(new NotFoundException('Cannot GET /nada'))).toEqual({
      statusCode: 404,
      mensaje: 'No se encontró lo que buscas.',
    });
    expect(construirRespuestaError(new ForbiddenException())).toEqual({
      statusCode: 403,
      mensaje: 'No tienes permiso para hacer esto.',
    });
  });

  it('respeta los mensajes en español escritos en la API', () => {
    expect(construirRespuestaError(new ConflictException('El pedido ya está pagado.'))).toEqual({
      statusCode: 409,
      mensaje: 'El pedido ya está pagado.',
    });
    expect(
      construirRespuestaError(new BadRequestException(['Falta el monto.', 'Falta el pedido.'])),
    ).toEqual({ statusCode: 400, mensaje: 'Falta el monto. Falta el pedido.' });
  });

  it('traduce errores de la base de datos', () => {
    const error = {
      meta: {
        driverAdapterError: {
          cause: { originalCode: 'P0001', originalMessage: 'Cobro excede el saldo.' },
        },
      },
    };
    expect(construirRespuestaError(error)).toEqual({
      statusCode: 422,
      mensaje: 'Cobro excede el saldo.',
    });
  });

  it('nunca muestra detalles técnicos de un error desconocido', () => {
    const r = construirRespuestaError(new TypeError('x is undefined'));
    expect(r.statusCode).toBe(500);
    expect(r.mensaje).not.toContain('undefined');
  });
});
