import { Module } from '@nestjs/common';
import { PedidosModule } from '../pedidos/pedidos.module.js';
import { TiempoRealModule } from '../tiempo-real/tiempo-real.module.js';
import { CajaController } from './caja.controller.js';
import { CajaService } from './caja.service.js';
@Module({ imports: [PedidosModule, TiempoRealModule], controllers: [CajaController], providers: [CajaService] })
export class CajaModule {}
