import { config } from 'dotenv';
import pg from 'pg';

config({ path: new URL('../../../.env', import.meta.url), quiet: true });
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en el archivo .env de la raíz.');
  process.exit(1);
}
const cliente = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  options: '-c search_path=ventas -c timezone=America/Guatemala',
});
try {
  await cliente.connect();
  const { rows: [estado] } = await cliente.query(`
    SELECT current_database() AS base, current_setting('TimeZone') AS zona,
      (SELECT count(*)::int FROM ventas.usuario) AS usuarios,
      (SELECT count(*)::int FROM ventas.producto) AS productos,
      (SELECT count(*)::int FROM ventas.pedido) AS pedidos
  `);
  console.log('PostgreSQL conectado. Comprobación de solo lectura:');
  console.log(JSON.stringify(estado, null, 2));
} catch (error) {
  const mensajes = {
    ECONNREFUSED: 'PostgreSQL no está disponible. Inicia Docker Desktop y la base local.',
    '28P01': 'PostgreSQL rechazó las credenciales. Comprueba que usas la base del proyecto y revisa .env.',
    '3D000': 'La base configurada no existe en este servidor. Revisa DATABASE_URL.',
    '42P01': 'La conexión funciona, pero falta el esquema de ventas esperado. Revisa que sea la base del proyecto.',
  };
  const codigo = error.code ?? error.errors?.[0]?.code;
  console.error(mensajes[codigo] ?? 'No se pudo comprobar la base local. Revisa Docker Desktop y DATABASE_URL.');
  process.exitCode = 1;
} finally {
  await cliente.end();
}
