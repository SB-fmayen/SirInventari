# Ventas en mostrador · Una PC

Cambio solicitado por el usuario el 2026-11-07. La operación se realiza desde una PC en el mostrador. **Ventas** reúne la toma de pedidos y el cobro; Caja deja de ser una entrada independiente del menú.

## Operación

1. Abrir el turno en Turnos y entrar en Ventas → Nuevo pedido.
2. La opción inicial es Para llevar. No se ofrece Mesa para ventas nuevas cuando hay tipos de mostrador configurados. Los pedidos históricos y borradores anteriores se conservan.
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
