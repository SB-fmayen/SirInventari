/**
 * Crea (o reactiva) el primer usuario ADMIN en la base de datos.
 *
 * Pasos:
 *  1. En la consola de Firebase → Authentication → Users → "Add user", crear el usuario
 *     con su correo y contraseña. Copiar su "User UID".
 *  2. En apps/api:
 *       npm run crear-admin -- --uid <User UID> --email <correo> --nombre "Nombre Apellido"
 *
 * El ADMIN puede trabajar en todos los centros de venta.
 */
import { parseArgs } from 'node:util';
import { config } from 'dotenv';

config({ path: '../../.env', quiet: true });
const { PrismaService } = await import('../src/prisma/prisma.service.js');
const { traducirErrorBd } = await import('../src/comun/errores-bd.js');

const { values } = parseArgs({
  options: {
    uid: { type: 'string' },
    email: { type: 'string' },
    nombre: { type: 'string' },
  },
});

const uid = values.uid?.trim();
const email = values.email?.trim().toLowerCase();
const nombre = values.nombre?.trim();

if (!uid || !email || !nombre) {
  console.error(
    'Faltan datos. Uso:\n  npm run crear-admin -- --uid <User UID de Firebase> --email <correo> --nombre "Nombre Apellido"',
  );
  process.exit(1);
}

const prisma = new PrismaService();
try {
  const usuario = await prisma.usuario.upsert({
    where: { firebase_uid: uid },
    create: { firebase_uid: uid, email, nombre, rol: 'ADMIN' },
    update: { email, nombre, rol: 'ADMIN', activo: true },
  });
  console.log(`Listo: ${usuario.nombre} (${usuario.email}) es ADMIN. Id en la base: ${usuario.id}.`);
} catch (error) {
  const traducido = traducirErrorBd(error);
  console.error(`No se pudo crear el ADMIN: ${traducido?.mensaje ?? String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
