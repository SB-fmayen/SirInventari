import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../autenticacion/autenticacion.module.js';
import { CentrosController, UsuariosController } from './usuarios.controller.js';
import { UsuariosService } from './usuarios.service.js';

@Module({
  imports: [AutenticacionModule],
  controllers: [UsuariosController, CentrosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
