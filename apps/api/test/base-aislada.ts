import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** Base local desechable: permite probar pagos sin borrar ni alterar ventas del desarrollo. */
export async function crearBaseAislada() {
  const original = process.env.DATABASE_URL;
  if (!original) throw new Error('Falta DATABASE_URL para preparar las pruebas.');
  const nombre = `sirinventari_pruebas_${randomUUID().replaceAll('-', '')}`;
  const administrador = new pg.Client({ connectionString: original });
  await administrador.connect();
  let creada = false;
  let prisma: PrismaService | undefined;
  async function cerrar() {
    await prisma?.$disconnect();
    // Nunca permite borrar la base original: solo el nombre aleatorio generado aquí.
    if (creada && /^sirinventari_pruebas_[a-f0-9]{32}$/.test(nombre)) {
      await administrador.query(`DROP DATABASE "${nombre}" WITH (FORCE)`);
      creada = false;
    }
    await administrador.end();
  }
  try {
    await administrador.query(`CREATE DATABASE "${nombre}"`);
    creada = true;
    const url = new URL(original); url.pathname = `/${nombre}`;
    const cliente = new pg.Client({ connectionString: url.toString() });
    await cliente.connect();
    try {
      await cliente.query(await readFile('../../db/01_esquema_v0.3.sql', 'utf8'));
      await cliente.query(await readFile('../../db/02_datos_iniciales.sql', 'utf8'));
    } finally { await cliente.end(); }
    // La URL de la base aislada se usa solo para construir esta conexión.
    try { process.env.DATABASE_URL = url.toString(); prisma = new PrismaService(); }
    finally { process.env.DATABASE_URL = original; }
    return { prisma, cerrar };
  } catch (error) { await cerrar(); throw error; }
}
