import { HttpStatus } from '@nestjs/common';

/** Error de la base ya traducido para mostrarlo al usuario. */
export interface ErrorTraducido {
  estado: HttpStatus;
  mensaje: string;
}

/** Datos del error original de PostgreSQL que Prisma guarda en `meta.driverAdapterError.cause`. */
interface CausaPostgres {
  originalCode?: string;
  originalMessage?: string;
  constraint?: { index?: string; fields?: string[] } | string;
}

/** Mensajes para los índices únicos del esquema (db/01_esquema_v0.3.sql). */
const MENSAJES_UNICOS: Record<string, string> = {
  uq_pago_voucher: 'El número de autorización del voucher ya se usó en otro pago.',
  uq_turno_abierto: 'Ya hay un turno de caja abierto en este centro de venta.',
  pedido_folio_offline_key: 'Ese folio provisional ya existe en otro pedido.',
  pedido_centro_venta_id_fecha_operacion_folio_key:
    'Ese folio ya existe en este centro de venta para el día.',
  pos_transaccion_terminal_pos_fecha_operacion_referencia_pos_key:
    'Esa transacción del POS ya estaba importada.',
  producto_sku_key: 'Ya existe un producto con ese SKU.',
  categoria_nombre_key: 'Ya existe una categoría con ese nombre.',
  usuario_email_key: 'Ya existe un usuario con ese correo.',
  usuario_firebase_uid_key: 'Ese usuario de Firebase ya está registrado.',
  dispositivo_codigo_key: 'Ya existe un dispositivo con ese código.',
  centro_venta_codigo_key: 'Ya existe un centro de venta con ese código.',
  sync_conflicto_operacion_id_key: 'Esa operación ya está en la bandeja de conflictos.',
};

/** Mensajes para las reglas CHECK del esquema. */
const MENSAJES_CHECK: Record<string, string> = {
  pedido_check: 'Un pedido hecho sin internet debe traer su folio provisional.',
  pedido_descuento_check: 'El descuento no puede ser negativo.',
  pedido_total_check: 'El total del pedido no puede ser negativo.',
  pedido_detalle_check: 'Para anular un producto hay que indicar quién lo anula y el motivo.',
  pedido_detalle_cantidad_check: 'La cantidad debe ser mayor que cero.',
  pedido_detalle_precio_unitario_check: 'El precio no puede ser negativo.',
  pago_check: 'Para anular un pago hay que indicar quién lo anula y el motivo.',
  pago_monto_check: 'El monto del pago debe ser mayor que cero.',
  producto_precio_base_check: 'El precio no puede ser negativo.',
  producto_centro_precio_check: 'El precio no puede ser negativo.',
};

function leerCausa(error: unknown): CausaPostgres | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const e = error as { meta?: { driverAdapterError?: { cause?: CausaPostgres } } };
  return e.meta?.driverAdapterError?.cause;
}

function nombreRestriccion(causa: CausaPostgres): string | undefined {
  if (typeof causa.constraint === 'string') return causa.constraint;
  if (causa.constraint?.index) return causa.constraint.index;
  // Si no viene el nombre, se busca en el mensaje original: ... constraint "nombre"
  return causa.originalMessage?.match(/constraint "([^"]+)"/)?.[1];
}

function esErrorDeConexion(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { name?: string; code?: string; message?: string };
  return (
    e.name === 'PrismaClientInitializationError' ||
    e.code === 'ECONNREFUSED' ||
    e.code === 'P1001' ||
    /ECONNREFUSED|reach database|connect ETIMEDOUT/i.test(e.message ?? '')
  );
}

/**
 * Traduce un error de Prisma/PostgreSQL a un mensaje claro en español.
 * Devuelve `null` si el error no viene de la base de datos.
 */
export function traducirErrorBd(error: unknown): ErrorTraducido | null {
  if (esErrorDeConexion(error)) {
    return {
      estado: HttpStatus.SERVICE_UNAVAILABLE,
      mensaje: 'No se pudo conectar con la base de datos. Intenta de nuevo en un momento.',
    };
  }

  const prismaCode = (error as { code?: string } | null)?.code;
  if (prismaCode === 'P2025') {
    return { estado: HttpStatus.NOT_FOUND, mensaje: 'No se encontró el registro.' };
  }

  const causa = leerCausa(error);
  if (!causa?.originalCode) return null;
  const restriccion = nombreRestriccion(causa);

  switch (causa.originalCode) {
    // Reglas propias de los triggers: el mensaje ya viene en español
    case 'P0001':
      return {
        estado: HttpStatus.UNPROCESSABLE_ENTITY,
        mensaje: causa.originalMessage ?? 'La operación no cumple una regla del sistema.',
      };
    case '23505':
      return {
        estado: HttpStatus.CONFLICT,
        mensaje:
          (restriccion && MENSAJES_UNICOS[restriccion]) ??
          (restriccion?.endsWith('_pkey')
            ? 'Ese registro ya existe.'
            : 'Ya existe un registro con esos datos.'),
      };
    case '23503':
      return {
        estado: HttpStatus.BAD_REQUEST,
        mensaje: 'Hace referencia a un dato que no existe (producto, usuario, pedido u otro).',
      };
    case '23502':
      return { estado: HttpStatus.BAD_REQUEST, mensaje: 'Falta un dato obligatorio.' };
    case '23514':
      return {
        estado: HttpStatus.BAD_REQUEST,
        mensaje: (restriccion && MENSAJES_CHECK[restriccion]) ?? 'Uno de los datos no es válido.',
      };
    case '22P02':
    case '22007':
    case '22008':
      return {
        estado: HttpStatus.BAD_REQUEST,
        mensaje: 'Uno de los datos tiene un formato no válido.',
      };
    case '22003':
      return { estado: HttpStatus.BAD_REQUEST, mensaje: 'Un número es demasiado grande.' };
    case '40001':
    case '40P01':
      return {
        estado: HttpStatus.CONFLICT,
        mensaje: 'Otra persona estaba cambiando el mismo dato. Intenta de nuevo.',
      };
    default:
      return null;
  }
}
