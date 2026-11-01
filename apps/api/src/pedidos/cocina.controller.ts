import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual, UsuarioActual, type UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { PedidosService } from './pedidos.service.js';
import { objeto, uuid } from './validacion-pedido.js';

@Controller('cocina')
@Roles('ADMIN', 'GERENTE', 'COCINA')
export class CocinaController {
  constructor(private readonly pedidos: PedidosService) {}
  @Get() listar(@CentroActual() centroId: number) { return this.pedidos.cocina(centroId); }
  @Post(':id/estado') cambiar(@CentroActual() centroId: number, @UsuarioActual() usuario: UsuarioSesion,
    @Param('id') id: string, @Body() cuerpo: unknown) {
    const c = objeto(cuerpo);
    const estados = ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO'];
    if (typeof c.estado_actual !== 'string' || !estados.includes(c.estado_actual) || typeof c.estado_cocina !== 'string' || !estados.includes(c.estado_cocina)) {
      throw new BadRequestException('Elige un estado de cocina válido.');
    }
    return this.pedidos.cambiarCocina(centroId, usuario.id, uuid(id), c.estado_actual, c.estado_cocina);
  }
}
