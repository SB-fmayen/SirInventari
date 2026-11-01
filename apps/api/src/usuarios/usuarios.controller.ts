import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { UsuarioActual, type UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { UsuariosService } from './usuarios.service.js';
import { validarCambiosUsuario, validarNuevoUsuario } from './validacion-usuario.js';

const idValido = new ParseIntPipe({
  exceptionFactory: () => new BadRequestException('El número de usuario no es válido.'),
});

/** Administración de usuarios: solo el ADMIN. */
@Roles('ADMIN')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  crear(@Body() cuerpo: unknown) {
    return this.usuarios.crear(validarNuevoUsuario(cuerpo));
  }

  @Patch(':id')
  actualizar(@Param('id', idValido) id: number, @Body() cuerpo: unknown) {
    return this.usuarios.actualizar(id, validarCambiosUsuario(cuerpo));
  }

  @Patch(':id/activo')
  cambiarActivo(
    @Param('id', idValido) id: number,
    @Body() cuerpo: { activo?: unknown } | undefined,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    if (typeof cuerpo?.activo !== 'boolean') {
      throw new BadRequestException('Indica si el usuario queda activo o no.');
    }
    return this.usuarios.cambiarActivo(id, cuerpo.activo, usuario.id);
  }
}

/** Centros de venta activos (para formularios del ADMIN y del GERENTE). */
@Roles('ADMIN', 'GERENTE')
@Controller('centros')
export class CentrosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listarCentros();
  }
}
