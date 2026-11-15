import 'reflect-metadata';
import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { PrismaService } from '../dist/prisma/prisma.service.js';

// Pone la foto de su sección a cada producto del menú La Iguana.
// Ejecutar desde apps/api, después de npm run build y de comprimir las fotos.
// Sin argumentos simula con ROLLBACK; --aplicar guarda. Solo llena productos SIN foto
// (no reemplaza fotos puestas a mano), salvo que se use --reemplazar.
config({ path: new URL('../../../.env', import.meta.url), quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  throw new Error('Esta carga está limitada a la base local.');
}
const aplicar = process.argv.includes('--aplicar');
const reemplazar = process.argv.includes('--reemplazar');
const menu = JSON.parse(await readFile(new URL('../../../docs/datos/menu-iguana.json', import.meta.url), 'utf8'));

const carpetaCategoria = {
  'LASAÑA': '01-lasana', ENTRADAS: '02-entradas', HAMBURGUESAS: '03-hamburguesas',
  'PIZZAS PERSONALES': '04-pizzas-personales', 'PIZZAS GRANDES': '05-pizzas-grandes',
  'DON CALZONE': '06-don-calzone', ENRROLLADOS: '07-enrrollados', 'CONO PIZZA': '08-cono-pizza',
  'TORTILLAS DE HARINA': '09-tortillas-de-harina', SHUKOS: '10-shukos', EXTRAS: '11-extras', BEBIDAS: '12-bebidas',
};
function imagenDe(p) {
  if (/pan/i.test(p.nombre) && /porci[oó]n|extra/i.test(p.nombre)) return 'productos/porcion-de-pan.webp';
  const cat = carpetaCategoria[p.categoria];
  assert.ok(cat, `Categoría sin imagen: ${p.categoria}`);
  const sub = cat.slice(3);
  const s = p.seccion.toLowerCase();
  if (p.categoria === 'SHUKOS' || p.categoria === 'TORTILLAS DE HARINA') return `subcategorias/${sub}/01-especialidades.webp`;
  if (s.includes('premium')) return `subcategorias/${sub}/03-premium.webp`;
  if (s.includes('especialidad')) return `subcategorias/${sub}/02-especialidades.webp`;
  if (s.includes('tradicional') || s.includes('1 ingrediente')) return `subcategorias/${sub}/01-tradicionales.webp`;
  return `categorias/${cat}.webp`;
}

const cache = new Map();
async function dataUri(rel) {
  if (!cache.has(rel)) {
    const bin = await readFile(new URL(`../../../docs/datos/fotos-iguana/${rel}`, import.meta.url));
    assert.ok(bin.length <= 204800, `Foto mayor a 200 KB: ${rel}`);
    cache.set(rel, `data:image/webp;base64,${bin.toString('base64')}`);
  }
  return cache.get(rel);
}

const filas = [];
for (const p of menu.productos) {
  for (const v of p.variantes.length ? p.variantes : [{ nombre: '' }]) {
    const sku = `IGU-${createHash('sha256').update(JSON.stringify([p.categoria, p.fuente, p.nombre, v.nombre])).digest('hex').slice(0, 20)}`;
    filas.push({ sku, imagen: imagenDe(p), foto: await dataUri(imagenDe(p)) });
  }
}
assert.equal(filas.length, 152);

const prisma = new PrismaService();
const simulacion = new Error('Carga de prueba: revertir los cambios.');
try {
  await prisma.$transaction(async tx => {
    let actualizados = 0, conFotoPrevia = 0, faltantes = 0;
    for (const f of filas) {
      const prod = await tx.producto.findUnique({ where: { sku: f.sku }, select: { id: true, foto_datos: true } });
      if (!prod) { faltantes++; continue; }
      if (prod.foto_datos && !reemplazar) { conFotoPrevia++; continue; }
      await tx.producto.update({ where: { id: prod.id }, data: { foto_datos: f.foto } });
      actualizados++;
    }
    console.log(JSON.stringify({ modo: aplicar ? 'Guardar' : 'Prueba con ROLLBACK', actualizados, conFotoPrevia, faltantes,
      imagenesUsadas: cache.size }, null, 2));
    if (!aplicar) throw simulacion;
  }, { timeout: 60000 });
} catch (error) {
  if (error !== simulacion) throw error;
} finally {
  await prisma.$disconnect();
}
