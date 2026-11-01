// Configuración de Prisma. Las credenciales se leen del .env de la raíz del proyecto.
// IMPORTANTE: no se usan migraciones. La base la define db/01_esquema_v0.3.sql
// y Prisma solo la lee con:  npx prisma db pull
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
