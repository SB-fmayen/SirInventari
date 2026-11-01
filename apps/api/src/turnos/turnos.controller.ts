import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual, UsuarioActual, type UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { montoCaja, TurnosService } from './turnos.service.js';

@Controller('turnos')
@Roles('ADMIN', 'GERENTE', 'CAJERO')
export class TurnosController {
  constructor(private readonly turnos: TurnosService) {}

  @Get()
  listar(@CentroActual() centroId: number) { return this.turnos.listar(centroId); }

  @Post()
  abrir(@CentroActual() centroId: number, @UsuarioActual() usuario: UsuarioSesion, @Body() cuerpo: unknown) {
    return this.turnos.abrir(centroId, usuario.id, montoCaja(cuerpo, 'fondo_inicial'));
  }

  @Post(':id/cierre')
  cerrar(@CentroActual() centroId: number, @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', new ParseIntPipe({ exceptionFactory: () => new BadRequestException('El número de turno no es válido.') })) id: number, @Body() cuerpo: unknown) {
    return this.turnos.cerrar(centroId, usuario.id, id, montoCaja(cuerpo, 'efectivo_contado'));
  }
}
