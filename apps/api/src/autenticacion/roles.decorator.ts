import { SetMetadata } from '@nestjs/common';
import type { Rol } from './usuario-sesion.js';

export const ROLES_PERMITIDOS = 'rolesPermitidos';

/**
 * Indica qué roles pueden usar una ruta o un controlador.
 * Ejemplo: @Roles('ADMIN', 'GERENTE'). Sin este decorador, cualquier usuario con sesión puede entrar.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_PERMITIDOS, roles);
