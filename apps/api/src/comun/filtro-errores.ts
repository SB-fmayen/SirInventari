import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { traducirErrorBd } from './errores-bd.js';

/** Respuesta de error que recibe la app. */
export interface RespuestaError {
  statusCode: number;
  mensaje: string;
}

const MENSAJE_INESPERADO =
  'Ocurrió un error inesperado. Intenta de nuevo; si sigue pasando, avisa al administrador.';

/** Mensajes en español para los errores HTTP que NestJS genera en inglés. */
const MENSAJES_HTTP: Partial<Record<number, string>> = {
  400: 'La solicitud no es válida.',
  401: 'Necesitas iniciar sesión.',
  403: 'No tienes permiso para hacer esto.',
  404: 'No se encontró lo que buscas.',
  405: 'Esta acción no está permitida.',
  409: 'La operación choca con otro dato.',
  413: 'El archivo o los datos son demasiado grandes.',
  422: 'Los datos no cumplen una regla del sistema.',
  429: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  500: MENSAJE_INESPERADO,
  503: 'El servicio no está disponible. Intenta de nuevo en un momento.',
};

// Textos por defecto de NestJS/Express (en inglés) que hay que reemplazar
const TEXTO_INGLES =
  /^(Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) |Bad Request|Unauthorized|Forbidden|Not Found|Method Not Allowed|Conflict|Payload Too Large|Unprocessable Entity|Too Many Requests|Internal Server Error|Service Unavailable|Http Exception|Unexpected token|Unexpected end|Expected )/i;

function mensajeDeHttp(excepcion: HttpException): string {
  const estado = excepcion.getStatus();
  const cuerpo = excepcion.getResponse();
  let mensaje: string | undefined;
  if (typeof cuerpo === 'string') {
    mensaje = cuerpo;
  } else if (typeof cuerpo === 'object' && cuerpo !== null) {
    const c = cuerpo as { mensaje?: unknown; message?: unknown };
    const m = c.mensaje ?? c.message;
    mensaje = Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : undefined;
  }
  if (!mensaje || TEXTO_INGLES.test(mensaje)) {
    return MENSAJES_HTTP[estado] ?? MENSAJE_INESPERADO;
  }
  return mensaje;
}

/** Convierte cualquier error en la respuesta { statusCode, mensaje } en español. */
export function construirRespuestaError(excepcion: unknown): RespuestaError {
  if (excepcion instanceof HttpException) {
    return { statusCode: excepcion.getStatus(), mensaje: mensajeDeHttp(excepcion) };
  }
  const traducido = traducirErrorBd(excepcion);
  if (traducido) {
    return { statusCode: traducido.estado, mensaje: traducido.mensaje };
  }
  return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, mensaje: MENSAJE_INESPERADO };
}

/**
 * Filtro global: toda respuesta de error sale como { statusCode, mensaje } en español.
 * Los errores de los triggers de la base llegan con su mensaje original (ya en español).
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Response>();
    const cuerpo = construirRespuestaError(excepcion);
    if (cuerpo.statusCode >= 500) {
      this.logger.error(excepcion instanceof Error ? excepcion.stack : String(excepcion));
    }
    respuesta.status(cuerpo.statusCode).json(cuerpo);
  }
}
