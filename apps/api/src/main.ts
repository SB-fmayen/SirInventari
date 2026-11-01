import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function iniciar(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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
