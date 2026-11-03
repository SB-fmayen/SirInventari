import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function iniciar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Fotos pequeñas del catálogo: hasta 200 KB binarios, codificados en base64.
  app.useBodyParser('json', { limit: '512kb' });
  // Direcciones de la app web que pueden llamar a la API (separadas por coma)
  const origenes = (process.env.CORS_ORIGENES ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origenes });
  app.enableShutdownHooks();
  const puerto = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  await app.listen(puerto, '0.0.0.0');
  Logger.log(`API lista en http://localhost:${puerto}  (prueba: /salud)`, 'Inicio');
}
await iniciar();
