import { JSDOM } from 'jsdom';
import { mkdir, writeFile } from 'node:fs/promises';

const origen = 'https://shukoslaiguana.com';
const leidas = new Set();
const paginas = [];
const productos = [];
const texto = (nodo) => nodo?.textContent.replace(/\s+/g, ' ').trim() ?? '';
const claveRuta = (url) => decodeURIComponent(new URL(url, origen).pathname).toLocaleLowerCase('es');

async function documento(url) {
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!respuesta.ok || new URL(respuesta.url).origin !== origen) throw new Error(`No se pudo leer ${url}: ${respuesta.status}`);
  // Solo se analiza el HTML público; no se ejecutan scripts ni acciones del carrito.
  return new JSDOM(await respuesta.text(), { url }).window.document;
}

const inicio = await documento(origen);
const categorias = [...inicio.querySelectorAll('a[href^="/menu/"]')].map((a, indice) => ({ nombre: texto(a), url: new URL(a.getAttribute('href'), origen).href, orden: indice + 1 }));
if (categorias.length !== 12) throw new Error(`Revisar el menú: se esperaban 12 categorías y se encontraron ${categorias.length}.`);
const raices = new Set(categorias.map((c) => claveRuta(c.url)));

async function leerCategoria(categoria) {
  const pendientes = [categoria.url];
  while (pendientes.length) {
    const url = pendientes.shift();
    if (leidas.has(url)) continue;
    leidas.add(url);
    if (leidas.size > 100) throw new Error('El menú tiene más páginas de las esperadas; revisar antes de importar.');
    const doc = await documento(url);
    const seccion = texto(doc.querySelector('h1'));
    const tarjetas = [...doc.querySelectorAll('.text-card-foreground')].filter((c) => [...c.querySelectorAll('button')].some((b) => texto(b) === 'Agregar al carrito'));
    const contador = texto(doc.querySelector('main') ?? doc.body).match(/(\d+)\s+productos? disponibles/);
    if (contador && Number(contador[1]) !== tarjetas.length) throw new Error(`No coinciden las tarjetas y el contador en ${url}.`);
    paginas.push({ url, categoria: categoria.nombre, seccion, productos: tarjetas.length });
    for (const tarjeta of tarjetas) {
      const nombre = texto(tarjeta.querySelector('.tracking-tight'));
      const detalle = texto(tarjeta.querySelector('.text-sm.text-muted-foreground'));
      const precioVisible = texto(tarjeta.querySelector('p.text-primary-foreground'));
      const importe = precioVisible.match(/Q\s*([\d,]+(?:\.\d{1,2})?)/);
      if (!nombre || !importe) throw new Error(`Producto sin nombre/precio comprobable en ${url}.`);
      const precio = Number(importe[1].replaceAll(',', '')).toFixed(2);
      const opcionesPrecio = [...detalle.matchAll(/Q\s*([\d,]+(?:\.\d{1,2})?)/g)];
      const variantes = opcionesPrecio.length > 1 ? detalle.split('|').map((parte) => {
        const opcion = parte.trim().match(/^(.+?)\s*Q\s*([\d,]+(?:\.\d{1,2})?)$/);
        if (!opcion) throw new Error(`Revisar variantes de ${nombre}: ${detalle}`);
        return { nombre: opcion[1].trim(), precio: Number(opcion[2].replaceAll(',', '')).toFixed(2) };
      }) : [];
      productos.push({ categoria: categoria.nombre, seccion, nombre, precio, variantes, fuente: url });
    }
    for (const a of doc.querySelectorAll('a[href^="/menu/"]')) {
      const siguiente = new URL(a.getAttribute('href'), origen);
      if (siguiente.origin !== origen || raices.has(claveRuta(siguiente.href)) || leidas.has(siguiente.href)) continue;
      pendientes.push(siguiente.href);
    }
  }
}

for (let indice = 0; indice < categorias.length; indice += 3) await Promise.all(categorias.slice(indice, indice + 3).map(leerCategoria));
for (const categoria of categorias) if (!productos.some((p) => p.categoria === categoria.nombre)) throw new Error(`No se encontraron productos en ${categoria.nombre}; revisar antes de importar.`);
const destino = new URL('../../../docs/datos/menu-iguana.json', import.meta.url);
await mkdir(new URL('.', destino), { recursive: true });
const datos = { fuente: origen, capturado_en: new Date().toISOString(), categorias, paginas, productos };
await writeFile(destino, `${JSON.stringify(datos, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ paginas: paginas.length, productos: productos.length, por_categoria: categorias.map((c) => ({ categoria: c.nombre, productos: productos.filter((p) => p.categoria === c.nombre).length })), con_variantes: productos.filter((p) => p.variantes.length) }, null, 2));
