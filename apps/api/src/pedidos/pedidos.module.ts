import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { PedidosController } from './pedidos.controller.js';
import { PedidosService } from './pedidos.service.js';
import { TiempoRealModule } from '../tiempo-real/tiempo-real.module.js';
import { CocinaController } from './cocina.controller.js';
@Module({ imports: [CatalogoModule, TiempoRealModule], controllers: [PedidosController, CocinaController], providers: [PedidosService], exports: [PedidosService] })
export class PedidosModule {}
