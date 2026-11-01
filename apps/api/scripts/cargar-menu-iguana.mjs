import 'reflect-metadata';
import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { PrismaService } from '../dist/prisma/prisma.service.js';

// Ejecutar desde apps/api, después de npm run build.
// Sin argumentos verifica la carga con ROLLBACK; --aplicar guarda los productos.
config({ path: new URL('../../../.env', import.meta.url), quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  throw new Error('Esta carga está limitada a la base local.');
}
const menu = JSON.parse(await readFile(new URL('../../../docs/datos/menu-iguana.json', import.meta.url), 'utf8'));
const prefijos = {
  'PIZZAS PERSONALES': 'Pizza personal', 'PIZZAS GRANDES': 'Pizza grande',
  'DON CALZONE': 'Calzone', ENRROLLADOS: 'Enrollado', 'CONO PIZZA': 'Cono pizza',
  'TORTILLAS DE HARINA': 'Tortilla de harina', SHUKOS: 'Shuko',
};
const filas = menu.productos.flatMap(p => (p.variantes.length ? p.variantes : [{ nombre: '', precio: p.precio }]).map(v => ({
  categoria: p.categoria,
  sku: `IGU-${createHash('sha256').update(JSON.stringify([p.categoria, p.fuente, p.nombre, v.nombre])).digest('hex').slice(0, 20)}`,
  nombre: [prefijos[p.categoria], p.nombre, v.nombre].filter(Boolean).join(' - '),
  precio_base: v.precio,
})));
assert.equal(menu.categorias.length, 12);
assert.equal(menu.productos.length, 143);
assert.equal(filas.length, 152);
assert.equal(new Set(filas.map(f => f.sku)).size, filas.length);
assert.equal(new Set(filas.map(f => `${f.categoria}|${f.nombre}`)).size, filas.length);
for (const f of filas) {
  assert.ok(f.nombre.length <= 120 && /^\d+\.\d{2}$/.test(f.precio_base) && Number(f.precio_base) > 0);
}
const prisma = new PrismaService();
const simulacion = new Error('Carga de prueba: revertir los cambios.');
try {
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('LOCK TABLE ventas.producto IN SHARE ROW EXCLUSIVE MODE');
    const categorias = await tx.categoria.findMany();
    const datos = filas.map(({ categoria, ...f }) => {
      const coincidencias = categorias.filter(c => c.nombre.trim().toLocaleUpperCase('es') === categoria);
      assert.equal(coincidencias.length, 1, `Falta la categoría o está repetida: ${categoria}`);
      assert.ok(coincidencias[0].activo, `Categoría inactiva: ${categoria}`);
      return { ...f, categoria_id: coincidencias[0].id, activo: true };
    });
    const otrosAntes = await tx.producto.count({ where: { NOT: { sku: { in: datos.map(d => d.sku) } } } });
    const primera = await tx.producto.createMany({ data: datos, skipDuplicates: true });
    const segunda = await tx.producto.createMany({ data: datos, skipDuplicates: true });
    assert.equal(segunda.count, 0, 'La segunda carga no debe duplicar productos.');
    const guardados = await tx.producto.findMany({ where: { sku: { in: datos.map(d => d.sku) } } });
    assert.equal(guardados.length, datos.length);
    for (const d of datos) {
      const g = guardados.find(p => p.sku === d.sku);
      assert.equal(g.nombre, d.nombre);
      assert.equal(g.precio_base.toFixed(2), d.precio_base, `Precio diferente: ${d.nombre}`);
      assert.equal(g.categoria_id, d.categoria_id);
      assert.equal(g.activo, true);
    }
    assert.equal(await tx.producto.count({ where: { NOT: { sku: { in: datos.map(d => d.sku) } } } }), otrosAntes);
    console.log(JSON.stringify({ modo: process.argv.includes('--aplicar') ? 'Guardar' : 'Prueba con ROLLBACK', nuevos: primera.count, verificados: guardados.length, duplicados_segunda_carga: segunda.count,
      por_categoria: menu.categorias.map(c => ({ categoria: c.nombre, productos: filas.filter(f => f.categoria === c.nombre).length })) }, null, 2));
    if (!process.argv.includes('--aplicar')) throw simulacion;
  }, { timeout: 30000 });
} catch (error) {
  if (error !== simulacion) throw error;
} finally {
  await prisma.$disconnect();
}
