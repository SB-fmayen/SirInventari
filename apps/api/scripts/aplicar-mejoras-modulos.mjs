import { config } from 'dotenv';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

config({ path: new URL('../../../.env', import.meta.url), quiet: true });
const url = new URL(process.env.DATABASE_URL);
const cliente = new pg.Client({ connectionString: url.toString() });
const soloPrueba = process.argv.includes('--simular');
try {
  await cliente.connect();
  if (!soloPrueba) {
    const carpeta = new URL('../../../logs/', import.meta.url);
    await mkdir(carpeta, { recursive: true });
    const backup = spawnSync('C:/Program Files/PostgreSQL/16/bin/pg_dump.exe', ['-Fc', '--no-owner'], {
      env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) },
      maxBuffer: 128 * 1024 * 1024,
    });
    if (backup.status !== 0) throw new Error('No se pudo respaldar la base; no se aplicaron cambios.');
    await writeFile(new URL(`base-antes-mejoras-${Date.now()}.dump`, carpeta), backup.stdout, { mode: 0o600 });
    console.log('Respaldo privado guardado en logs (excluido de Git).');
  }
  await cliente.query('BEGIN');
  await cliente.query(await readFile(new URL('../../../db/06_mejoras_modulos.sql', import.meta.url), 'utf8'));
  await cliente.query(soloPrueba ? 'ROLLBACK' : 'COMMIT');
  console.log(soloPrueba ? 'Simulación correcta; cambios revertidos.' : 'Mejoras de módulos aplicadas sin borrar ventas.');
} catch (error) {
  await cliente.query('ROLLBACK').catch(() => {});
  console.error(error instanceof Error ? error.message : 'No se pudo actualizar la base.');
  process.exitCode = 1;
} finally { await cliente.end(); }
