// Ampliación autorizada por el usuario. Respaldo previo, sin imprimir credenciales.
import { config } from 'dotenv';
import pg from 'pg';
import { readFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
config({ path: new URL('../../../.env', import.meta.url), quiet: true });
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Este script solo admite la base local.');
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();
try {
  const {
    rows: [existe],
  } = await cliente.query(
    "SELECT to_regclass('ventas.cliente') IS NOT NULL AS existe",
  );
  if (existe.existe) {
    console.log('La ampliación de clientes ya está aplicada.');
  } else {
    const carpeta = new URL('../../../logs/', import.meta.url);
    await mkdir(carpeta, { recursive: true });
    const respaldo = fileURLToPath(
      new URL(`respaldo-clientes-${Date.now()}.dump`, carpeta),
    );
    const entorno = {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: url.pathname.slice(1),
    };
    const resultado = spawnSync(
      'C:/Program Files/PostgreSQL/16/bin/pg_dump.exe',
      ['-Fc', '-f', respaldo],
      { env: entorno, windowsHide: true },
    );
    if (resultado.status !== 0)
      throw new Error(
        'No se pudo crear el respaldo previo; no se modificó la base.',
      );
    const verificado = spawnSync(
      'C:/Program Files/PostgreSQL/16/bin/pg_restore.exe',
      ['--list', respaldo],
      { windowsHide: true },
    );
    if (verificado.status !== 0)
      throw new Error(
        'No se pudo verificar el respaldo; no se modificó la base.',
      );
    const sql = await readFile(
      new URL('../../../db/07_clientes_papelera.sql', import.meta.url),
      'utf8',
    );
    await cliente.query('BEGIN');
    try {
      await cliente.query(sql);
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    }
    console.log(
      'Respaldo verificado en logs/. Ampliación de clientes aplicada sin borrar datos.',
    );
  }
  const { rows } = await cliente.query(
    'SELECT (SELECT count(*) FROM ventas.usuario) AS usuarios, (SELECT count(*) FROM ventas.producto) AS productos, (SELECT count(*) FROM ventas.pedido) AS pedidos',
  );
  console.log(rows[0]);
} finally {
  await cliente.end();
}
