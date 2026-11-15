# Ventas en mostrador · Una PC

Cambio solicitado por el usuario el 2026-11-07. La operación se realiza desde una PC en el mostrador. **Ventas** reúne la toma de pedidos y el cobro; Caja deja de ser una entrada independiente del menú.

## Operación

1. Abrir el turno en Turnos y entrar en Ventas → Nuevo pedido.
2. La opción inicial es Para llevar. Desde el 2026-11-08 también se ofrece **Comer en mesa**, sin pedir número ni referencia de mesa porque el negocio no tiene mesas numeradas. Se conservan productos, nombre, teléfono y dirección al cambiar el tipo de venta. Usa el tipo MESA existente; las referencias de pedidos históricos se conservan.
3. Elegir una categoría visible o buscar por nombre/código. La búsqueda admite escribir sin tildes y busca en todas las categorías. Cada producto/tamaño conserva su precio propio; extras se encuentran en su categoría o con la búsqueda.
4. Agregar productos y revisar el resumen al lado: cantidades enteras, importes por línea, notas y total. Cada clic agrega una línea para permitir preparaciones distintas del mismo producto. Las cantidades se ajustan con +/−. Cambiar categoría o búsqueda conserva el pedido.
5. El nombre es opcional; si se deja vacío en una venta sin mesa se registra «Cliente de mostrador». El folio distingue los pedidos.
6. Pulsar **Guardar y cobrar**. Se guarda el pedido y abre su formulario de pago en la misma pantalla, sin volver a buscarlo. **Guardar pedido** permite dejarlo pendiente; desde su detalle se usa **Cobrar este pedido**.
7. Registrar el pago y comprobar saldo/vuelto/comprobante. Se conservan efectivo, tarjeta, transferencia y pagos divididos. Al terminar, **Nuevo pedido** inicia la siguiente venta.

**Pendientes y comprobantes** abre los cobros pendientes y el historial dentro de Ventas. **Ver pedidos guardados** vuelve a la lista. La ruta antigua `/caja` abre esa misma pantalla integrada por compatibilidad; no aparece otro módulo en el menú.

## Controles conservados

- El cobro requiere turno abierto y los permisos de Caja. MESERO conserva la toma de pedidos, sin acceso a cobros. Las restricciones de Pedidos y Caja siguen siendo independientes; si solo se permite Caja, Ventas muestra únicamente esa operación.
- Un fallo al guardar conserva el borrador e identificadores y no abre un cobro sin confirmar el pedido. El servidor sigue asignando folios y precios.
- Un resultado incierto del pago bloquea cambiar de pedido dentro de Ventas. Se reintenta el mismo UUID para evitar duplicados. También se protege la salida con terminal/voucher escritos.
- Se conservan las validaciones de saldo, pagos duplicados, voucher y pagos parciales. No se cambian base, API, pedidos anteriores ni permisos por rol.
- Guardar envía a Cocina. Registrar en SirInventari un pago de tarjeta sigue requiriendo realizar el cobro en el POS externo y copiar su autorización.

## Validación

Pruebas de pantalla con API simulada: guardar/cobrar/siguiente venta, categorías/búsqueda sin perder notas, reintento idéntico y bloqueo de navegación interna, error al guardar, turno cerrado y restricciones de acceso. Las pruebas anteriores conservan pago dividido y tarjeta con terminal/autorización. No crean ventas en la base local.

Verificación del 2026-11-07: 67 pruebas web correctas, build y lint correctos (5 avisos previos y aviso de tamaño). API/base sanas y módulo actualizado servido por Vite. La inspección visual no pudo completarse: el control de Chrome se detuvo al no poder verificar su URL. Pendiente revisar con el usuario el tamaño de categorías/productos/resumen y completar una venta funcional identificada como prueba.

## Corrección: revisar, anular e imprimir en láser

Implementada el 2026-11-07:

- En revisión/cobro se permite **Quitar producto**, con motivo. Recalcula total/saldo y conserva la línea anulada; el servidor impide reducir el total por debajo de lo ya cobrado. En un borrador sin guardar sigue disponible Quitar sin trámite de anulación.
- **Anular pedido** sirve si el cliente ya no lo quiere. Exige motivo, permisos de Pedidos/anular y ausencia de pagos aplicados. Conserva folio, productos e importes originales y registra motivo/autor en auditoría. Sale de pendientes y de Cocina. Reintentar no duplica la anulación; cobro y anulación se coordinan con bloqueo del pedido. La autorización general por gerente de Tarea 15 sigue siendo trabajo futuro; esta acción sigue los permisos actuales de anulación de Pedidos.
- **Cortesía** significa entregar gratis, con motivo y autorización de gerente/ADMIN. Es distinta de cancelar; la pantalla lo explica antes de ofrecerla. No usarla para retirar una compra que el cliente ya no quiere.
- Al quedar PAGADO y sin saldo se presenta el ticket con centro, folio, fechas de Guatemala, cliente, productos activos, cantidades, precios, importes, descuentos, total y formas de pago aplicadas. No imprime productos/pagos anulados. Incluye autorización del POS cuando existe. Recibido/vuelto del último pago en efectivo solo se muestran cuando están disponibles en esa sesión; esos datos no se inventan al reimprimir un comprobante histórico.
- **Imprimir ticket** abre la ventana normal de impresión del navegador. Corregido a petición del usuario: diseño angosto tipo recibo de 80 mm, con encabezado centrado, datos en una columna y precio unitario debajo de cada producto. Conserva ese ancho al imprimir; no se expande al tamaño de una hoja ni imprime los menús/formularios. Elegir escala 100 % y, si aparecen, desactivar encabezados/pies del navegador. El tamaño físico del papel depende de la impresora y su configuración; usar una láser no convierte su papel en rollo. También permite guardar como PDF.
- **Continuar sin imprimir** conserva el pago y prepara el siguiente pedido (o vuelve a cobros cuando el usuario solo tiene ese acceso). No hay impresión automática. Se puede volver a imprimir desde Pendientes y comprobantes → historial.

Validación actual: 69 pruebas web, 14 unitarias API y 86 de integración en bases aisladas, todas correctas. Compilación/lint correctos, con avisos anteriores. Pendiente vista previa e impresión física con el usuario; no se ha enviado papel a una impresora ni se han creado ventas de prueba en su base. La impresión térmica/sin internet de Tarea 19 conserva su alcance futuro.

## Configuración general de impresión · 2026-11-08

En el comprobante, elegir Formato del recibo: Automático, 58 mm, 80 mm, Carta o A4. La preferencia se guarda por navegador cuando el almacenamiento está disponible. Automático conserva el recibo compacto y se limita al ancho disponible; Carta/A4 conservan el recibo de 80 mm sobre una hoja. Para rollos, seleccionar también el tamaño correcto en el controlador. El navegador no instala ni configura automáticamente la impresora. Usar escala 100 % y desactivar encabezados/pies. Vista previa y copia impresa usan el mismo ancho. La impresión sigue siendo opcional desde el diálogo del navegador.

## Pantalla de Ventas simplificada · 2026-11-15

Pensada para vendedores nuevos, en 4 pasos numerados:

1. **¿Cómo se lleva el pedido?** Botones grandes con dibujo: Comer en mesa, Para llevar, A domicilio, App de entregas.
2. **Datos del cliente** (se puede cerrar). Se abre sola para domicilio o cuando ya hay datos.
3. **Toca los productos.** Cada toque suma 1 unidad; la tarjeta muestra «× 2» si ya está en el pedido. Tocar otra vez el mismo producto (sin notas) aumenta la cantidad en vez de repetir la línea.
4. **Revisa el pedido.** Botones − y + grandes, notas rápidas con un toque (Sin cebolla, Sin picante, Bien cocido, Para compartir; se quitan con otro toque) y total en una barra destacada.

En teléfono y tablet aparece abajo una barra «🛒 Ver pedido · Q total» que lleva al resumen. La lista de pedidos guardados marca en color «✓ Pagado», «✕ Anulado» o «Falta cobrar Q …».

## Vender sin internet · 2026-11-15 (Tareas 17 y 18)

Antes (con internet, una sola vez por equipo): en **Inicio → Este dispositivo** elegir qué equipo es (CAJA1, TAB01…) y abrir Ventas para que se guarden menú, precios, tipos de venta y formas de pago.

Si se cae el internet:

1. Arriba sale **Sin internet**. La sesión abierta sigue funcionando.
2. Se toma el pedido igual que siempre. Al guardar, queda en el equipo con **folio provisional** (CAJA1-0001, CAJA1-0002…) y la hora real del equipo.
3. «Guardar y cobrar» abre el **cobro sin internet** (modo mostrador): efectivo con vuelto, o tarjeta si el POS tiene su propia conexión (terminal y autorización obligatorias).
4. Se imprime la **comanda** para cocina (la pantalla de Cocina no recibe nada sin internet) y, si se quiere, el comprobante. Ver `docs/impresoras.md`.
5. En «Ventas sin internet en este equipo» se ve cada venta: *Pendiente de enviar*, *Enviado · folio definitivo N* o *En revisión del gerente* con el motivo.

Al volver el internet todo se envía solo, en el orden en que se hizo (el pedido antes que su cobro), cada 20 segundos o al tocar «Enviar ahora». Reenviar es seguro: no se duplica nada. Lo que choque con una regla (voucher repetido, producto agregado a un pedido ya cobrado, cobro de un pedido que no llegó, tablet desactivada, cobro hecho antes de abrir el turno) va a la **Bandeja de conflictos** del gerente en Inicio, con el motivo en palabras claras. El gerente también ve un aviso si un equipo no sincroniza hace más de 15 minutos.

Los pedidos guardados se buscan por folio definitivo o provisional.
