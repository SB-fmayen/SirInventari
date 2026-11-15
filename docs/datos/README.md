# Menú La Iguana

`menu-iguana.json` conserva los nombres, precios, tamaños y enlaces del menú público consultado el 1 de noviembre de 2026: https://shukoslaiguana.com/.

Se recorrieron 29 páginas y 12 categorías: 143 productos publicados se convierten en 152 opciones al separar los dos tamaños de 9 shukos. Los nombres de pizzas, calzones, enrollados, conos, tortillas y shukos incluyen el tipo para distinguirlos en pedidos. Los precios son los publicados, sin agregar impuestos ni modificar importes.

Para repetir la extracción, desde `apps/web`:

```powershell
node scripts/extraer-menu-iguana.mjs
```

Revisar la captura antes de cargarla. El importador valida las cantidades de esta captura; si cambia el menú, hay que revisar esos controles antes de actualizarlo.

Para cargar en la base local, primero ejecutar `db/04_categorias_iguana.sql` si faltan las categorías. Luego, desde `apps/api`:

```powershell
npm.cmd run build
node scripts/cargar-menu-iguana.mjs
node scripts/cargar-menu-iguana.mjs --aplicar
```

El primer comando del script simula con ROLLBACK; `--aplicar` guarda. Lee la conexión del `.env` de la raíz y solo permite una base en localhost. Usa una transacción y SKU estable por producto/tamaño; comprueba una segunda inserción sin duplicados y valida todos los precios guardados. Si un producto importado ya fue editado y no coincide, revierte la carga para permitir revisar la diferencia. No borra productos existentes ni cambia precios por centro. Sin precio o disponibilidad propios del centro, se usa el precio base y la disponibilidad predeterminada del sistema.

## Fotos del menú

`fotos-iguana/` guarda las 30 imágenes del menú comprimidas a WebP de 480×480 (unos 25 KB cada una). Cada producto recibe la foto de su sección (Tradicionales, Especialidades o Premium) o, si no tiene sección, la de su categoría; los panes extra usan la foto de porción de pan.

Para repetirlo con las imágenes originales (desde `apps/web` y luego `apps/api`):

```powershell
node scripts/comprimir-fotos-iguana.mjs "<carpeta Catalogo_La_Iguana>"
npm.cmd run build
node scripts/cargar-fotos-iguana.mjs            # simula con ROLLBACK
node scripts/cargar-fotos-iguana.mjs --aplicar  # guarda
```

Solo llena productos sin foto; no reemplaza las fotos puestas a mano (salvo con `--reemplazar`). Cada foto se puede cambiar después desde Catálogo.
