# Impresoras térmicas · comanda y comprobante (Tarea 19)

SirInventari imprime con la **impresión del navegador**. Por eso funciona con cualquier impresora que el equipo (Windows, Android o iPad) tenga instalada, **con o sin internet**: la comanda se arma en el mismo equipo y no se envía a la nube.

## Qué se imprime

| Hoja | Cuándo | Qué trae |
|---|---|---|
| **Comanda** (para cocina) | Ventas → al guardar un pedido sin internet, o en el detalle de cualquier pedido («🖨 Imprimir comanda») | Folio grande (**provisional**, por ejemplo `CAJA1-0001`, cuando es sin internet), tipo de venta, cliente, hora, cantidades y notas |
| **Comprobante sin internet** | Después de «Guardar cobro sin internet» | Lo anterior, más importes, total, forma de pago, autorización y vuelto |
| **Ticket de venta** (con internet) | Caja → «Imprimir ticket» al terminar de cobrar | Comprobante completo, con folio definitivo |

## Impresoras compatibles

Sirve cualquier impresora térmica de **58 mm u 80 mm** que tenga controlador (driver) para el sistema del equipo. Ejemplos conocidos:

- **USB (caja con Windows):** Epson TM-T20III / TM-T88, Xprinter XP-58 / XP-80, Bixolon SRP-330, 3nStar RPT-006. Instala el controlador del fabricante y elige el papel de 80 mm (o 58 mm).
- **Bluetooth (tablet Android):** impresoras portátiles de 58 mm (por ejemplo Xprinter XP-P300, Epson TM-P20). Empareja la impresora en Ajustes → Bluetooth y usa un servicio de impresión que la reconozca (por ejemplo RawBT o el servicio del fabricante). Luego, en Chrome, «Imprimir» la muestra como impresora.
- **Red / wifi:** funcionan igual si el equipo la tiene instalada. Sin internet basta con que la red local siga encendida.

No se necesitan programas especiales ni claves. Para impresoras que solo aceptan comandos ESC/POS sin controlador, se puede agregar después una conexión directa (WebUSB / Web Bluetooth); hoy no hace falta.

## Configurar la primera vez (en cada equipo)

1. Instala o empareja la impresora y haz una página de prueba desde el sistema.
2. En SirInventari abre un pedido y toca «🖨 Imprimir comanda».
3. En la ventana de impresión elige la impresora térmica, el papel de **80 mm** (o 58 mm), **escala 100 %**, **márgenes: ninguno** y **desactiva encabezados y pies de página**.
4. El navegador recuerda esa impresora para las siguientes veces.

## Prueba sin internet (Listo cuando de la Tarea 19)

1. Con internet, entra a la app, elige en Inicio «Este equipo es CAJA1» y abre Ventas una vez (así se guardan menú, precios y formas de pago).
2. Apaga el wifi (y los datos móviles).
3. Haz un pedido y toca «Guardar y cobrar»: aparece «pedido guardado en este equipo con folio provisional CAJA1-000N».
4. Toca «🖨 Imprimir comanda»: debe salir la hoja con **FOLIO PROVISIONAL CAJA1-000N** bien grande.
5. Vuelve a encender el wifi: en «Ventas sin internet en este equipo» el pedido cambia a «Enviado · folio definitivo N».

> Para la prueba sin internet hay que usar la app **compilada** (`npm run build` y `npm run preview` en `apps/web`, o la app publicada): en modo desarrollo el navegador no guarda la app para abrirla sin red.
