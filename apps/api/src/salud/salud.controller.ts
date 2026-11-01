import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

export interface EstadoSalud {
  api: 'ok';
  baseDatos: 'ok' | 'error';
  fechaOperacion: string | null;
  zonaHoraria: 'America/Guatemala';
  mensaje: string;
}

/** Ruta pública para saber si la API y la base de datos funcionan. */
@Controller('salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async revisar(@Res({ passthrough: true }) res: Response): Promise<EstadoSalud> {
    try {
      const filas = await this.prisma.$queryRaw<{ fecha: string }[]>`
        SELECT ventas.fecha_guatemala()::text AS fecha`;
      return {
        api: 'ok',
        baseDatos: 'ok',
        fechaOperacion: filas[0]?.fecha ?? null,
        zonaHoraria: 'America/Guatemala',
        mensaje: 'La API y la base de datos funcionan.',
      };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        api: 'ok',
        baseDatos: 'error',
        fechaOperacion: null,
        zonaHoraria: 'America/Guatemala',
        mensaje: 'La API funciona, pero no se pudo conectar con la base de datos.',
      };
    }
  }
}
