import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Conexión a PostgreSQL con Prisma.
 * Cada conexión usa el esquema `ventas` y la hora de Guatemala:
 * los triggers del esquema llaman a sus funciones sin el prefijo `ventas.`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('Falta DATABASE_URL en el archivo .env');
    }
    super({
      adapter: new PrismaPg(
        {
          connectionString: url,
          options: '-c search_path=ventas -c timezone=America/Guatemala',
        },
        { schema: 'ventas' },
      ),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
