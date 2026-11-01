import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type Rol = 'ADMIN' | 'GERENTE' | 'CAJERO' | 'MESERO' | 'COCINA';

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
}

export type RequestConUsuario = Request & { usuario?: UsuarioSesion };

/** Inyecta en el controlador el usuario que inició sesión. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioSesion | undefined =>
    ctx.switchToHttp().getRequest<RequestConUsuario>().usuario,
);
