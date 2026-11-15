// Comprime las imágenes originales del menú La Iguana a WebP pequeños (menos de 200 KB)
// y las deja en docs/datos/fotos-iguana con la misma estructura de carpetas.
// Uso, desde apps/web:  node scripts/comprimir-fotos-iguana.mjs "<carpeta Catalogo_La_Iguana>"
import sharp from 'sharp';
import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const origen = process.argv[2];
if (!origen) throw new Error('Indica la carpeta Catalogo_La_Iguana con las imágenes originales.');
const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/datos/fotos-iguana');

async function* pngs(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) yield* pngs(ruta);
    else if (/\.png$/i.test(e.name)) yield ruta;
  }
}

let total = 0;
for await (const archivo of pngs(origen)) {
  const relativo = path.relative(origen, archivo).replace(/\.png$/i, '.webp');
  const salida = path.join(destino, relativo);
  await mkdir(path.dirname(salida), { recursive: true });
  await sharp(archivo).resize(480, 480, { fit: 'cover' }).webp({ quality: 72 }).toFile(salida);
  const { size } = await stat(salida);
  if (size > 204800) throw new Error(`La imagen comprimida supera 200 KB: ${relativo}`);
  total++;
  console.log(`${relativo}  ${(size / 1024).toFixed(1)} KB`);
}
console.log(`Imágenes comprimidas: ${total}`);
