import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { PedidosController } from './pedidos.controller.js';
import { PedidosService } from './pedidos.service.js';
import { TiempoRealModule } from '../tiempo-real/tiempo-real.module.js';
@Module({ imports: [CatalogoModule, TiempoRealModule], controllers: [PedidosController], providers: [PedidosService], exports: [PedidosService] })
export class PedidosModule {}
