import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type Rol = 'ADMIN' | 'GERENTE' | 'CAJERO' | 'MESERO' | 'COCINA';
export const ROLES: Rol[] = ['ADMIN', 'GERENTE', 'CAJERO', 'MESERO', 'COCINA'];

export interface CentroSesion {
  id: number;
  codigo: string;
  nombre: string;
}

/** Usuario que inició sesión, tal como está en la base (no como viene del token). */
export interface UsuarioSesion {
  id: number;
  firebaseUid: string;
  nombre: string;
  email: string;
  rol: Rol;
  /** Centros donde puede trabajar. El ADMIN puede en todos los centros activos. */
  centros: CentroSesion[];
  permisos?: { modulo: string; accion: string; permitido: boolean }[];
}

export type RequestConUsuario = Request & { usuario?: UsuarioSesion; centroId?: number };

/** Inyecta en el controlador el usuario que inició sesión. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioSesion | undefined =>
    ctx.switchToHttp().getRequest<RequestConUsuario>().usuario,
);

/**
 * Inyecta el centro de venta elegido en la app (encabezado X-Centro-Id).
 * El guard ya comprobó que el usuario puede trabajar en ese centro.
 */
export const CentroActual = createParamDecorator((_dato: unknown, ctx: ExecutionContext): number => {
  const centroId = ctx.switchToHttp().getRequest<RequestConUsuario>().centroId;
  if (!centroId) {
    throw new BadRequestException('Elige un centro de venta para continuar.');
  }
  return centroId;
});
