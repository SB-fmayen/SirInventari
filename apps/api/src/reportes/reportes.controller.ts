import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual } from '../autenticacion/usuario-sesion.js';
import { uuid } from '../pedidos/validacion-pedido.js';
import { ReportesService } from './reportes.service.js';
@Controller('reportes')
@Roles('ADMIN', 'GERENTE')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}
  @Get('ventas') ventas(@CentroActual() centro: number, @Query('desde') desde?: unknown, @Query('hasta') hasta?: unknown) { return this.reportes.ventas(centro, desde, hasta); }
  @Get('pedidos/:id/historial') historial(@CentroActual() centro: number, @Param('id') id: string) { return this.reportes.historial(centro, uuid(id)); }
}
