import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { PedidosController } from './pedidos.controller.js';
import { PedidosService } from './pedidos.service.js';
@Module({ imports: [CatalogoModule], controllers: [PedidosController], providers: [PedidosService], exports: [PedidosService] })
export class PedidosModule {}
