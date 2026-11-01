import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AutenticacionGuard } from './autenticacion.guard.js';
import { SesionController } from './sesion.controller.js';
import { GestorUsuariosFirebase, VerificadorFirebase } from './verificador-firebase.js';

@Module({
  controllers: [SesionController],
  providers: [
    VerificadorFirebase,
    GestorUsuariosFirebase,
    { provide: APP_GUARD, useClass: AutenticacionGuard },
  ],
  exports: [VerificadorFirebase, GestorUsuariosFirebase],
})
export class AutenticacionModule {}
