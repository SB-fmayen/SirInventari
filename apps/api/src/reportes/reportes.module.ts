import { Module } from '@nestjs/common';
import { PedidosModule } from '../pedidos/pedidos.module.js';
import { ReportesController } from './reportes.controller.js';
import { ReportesService } from './reportes.service.js';
@Module({ imports: [PedidosModule], controllers: [ReportesController], providers: [ReportesService] })
export class ReportesModule {}
