import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AutenticacionModule } from './autenticacion/autenticacion.module.js';
import { FiltroErrores } from './comun/filtro-errores.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SaludModule } from './salud/salud.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { CatalogoModule } from './catalogo/catalogo.module.js';
import { TurnosModule } from './turnos/turnos.module.js';
import { PedidosModule } from './pedidos/pedidos.module.js';
import { CajaModule } from './caja/caja.module.js';
import { ReportesModule } from './reportes/reportes.module.js';
import { ControlModule } from './control/control.module.js';

@Module({
  imports: [
    // En desarrollo se usa el .env de la raíz del proyecto; en la nube, las variables del servidor.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
    }),
    PrismaModule,
    AutenticacionModule,
    SaludModule,
    UsuariosModule,
    CatalogoModule,
    TurnosModule,
    PedidosModule,
    CajaModule,
    ReportesModule,
    ControlModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: FiltroErrores }],
})
export class AppModule {}
