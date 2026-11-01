import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../autenticacion/autenticacion.module.js';
import { TiempoRealGateway } from './tiempo-real.gateway.js';
@Module({ imports: [AutenticacionModule], providers: [TiempoRealGateway], exports: [TiempoRealGateway] })
export class TiempoRealModule {}
