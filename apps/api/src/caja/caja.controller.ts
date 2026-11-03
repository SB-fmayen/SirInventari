import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual, UsuarioActual, type UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { uuid } from '../pedidos/validacion-pedido.js';
import { CajaService } from './caja.service.js';
import { nuevoPago } from './validacion-pago.js';
@Controller('caja')
@Roles('ADMIN', 'GERENTE', 'CAJERO')
export class CajaController {
  constructor(private readonly caja: CajaService) {}
  @Get('metodos') metodos() { return this.caja.metodos(); }
  @Get('pendientes') pendientes(@CentroActual() centro: number) { return this.caja.pendientes(centro); }
  @Get('historial') historial(@CentroActual() centro: number, @Query('fecha') fecha?: string, @Query('buscar') buscar?: string) { return this.caja.historial(centro, fecha, buscar); }
  @Get('pedidos/:id/comprobante') comprobante(@CentroActual() centro: number, @Param('id') id: string) { return this.caja.comprobante(centro, uuid(id)); }
  @Post('pagos') cobrar(@CentroActual() centro: number, @UsuarioActual() usuario: UsuarioSesion, @Body() cuerpo: unknown) { return this.caja.cobrar(centro, usuario.id, nuevoPago(cuerpo)); }
}
