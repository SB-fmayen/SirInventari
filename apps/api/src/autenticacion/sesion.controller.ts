import { Controller, Get } from '@nestjs/common';
import { UsuarioActual, type UsuarioSesion } from './usuario-sesion.js';

@Controller('sesion')
export class SesionController {
  /** Datos del usuario que inició sesión: nombre, rol y centros. */
  @Get()
  obtener(@UsuarioActual() usuario: UsuarioSesion) {
    const { id, nombre, email, rol, centros } = usuario;
    return { id, nombre, email, rol, centros };
  }
}
