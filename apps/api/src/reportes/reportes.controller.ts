import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual, UsuarioActual, type UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { uuid } from '../pedidos/validacion-pedido.js';
import { ReportesService } from './reportes.service.js';
@Controller('reportes')
@Roles('ADMIN', 'GERENTE')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}
  @Get('control') control(@CentroActual() centro: number, @UsuarioActual() u: UsuarioSesion, @Query('desde') desde?: unknown, @Query('hasta') hasta?: unknown, @Query('todos') todos?: string) { return this.reportes.control(todos==='1'?u.centros.map(c=>c.id):[centro],desde,hasta); }
  @Get('anulaciones') anulaciones(@CentroActual() centro: number, @Query('desde') desde?: unknown, @Query('hasta') hasta?: unknown) { return this.reportes.anulaciones(centro, desde, hasta); }
  @Get('ventas') ventas(@CentroActual() centro: number, @Query('desde') desde?: unknown, @Query('hasta') hasta?: unknown) { return this.reportes.ventas(centro, desde, hasta); }
  @Get('pedidos/:id/historial') historial(@CentroActual() centro: number, @Param('id') id: string) { return this.reportes.historial(centro, uuid(id)); }
}
