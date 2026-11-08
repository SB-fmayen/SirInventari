# Clientes, datos de entrega y papelera

Propuesta del 2026-11-08 para la solicitud del usuario. Pendiente de aprobación de cambios de base según AGENTS.md, regla 3. Este documento no modifica la base ni declara implementadas las pantallas.

## Comportamiento acordable

- En Ventas, capturar nombre, teléfono y dirección. El teléfono tendrá al lado un botón Buscar cliente. Buscar por teléfono o nombre y elegir explícitamente el resultado; no asociar automáticamente personas por coincidencias parciales. Permitir venta anónima como hasta ahora. Un teléfono escrito requiere nombre para registrar al cliente; una venta a domicilio requiere dirección y teléfono. No exigir dirección para una venta para llevar.
- Al guardar un nuevo pedido con datos de cliente, crear su ficha si no existe o vincular la seleccionada. Si los datos difieren de una ficha existente, pedir una decisión explícita para actualizarla; no sobrescribir datos por una venta sin confirmación. Conservar el borrador y los UUID ante errores y reintentos.
- Separar los clientes por centro de venta. La búsqueda y los historiales solo muestran el centro autorizado/elegido; un GERENTE no puede consultar otro centro por cambiar un identificador. ADMIN puede cambiar de centro con el selector existente.
- Normalizar espacios y separadores del teléfono para buscar y detectar duplicados en el mismo centro. Admitir prefijo internacional y no imponer un país. La coincidencia no constituye una autenticación del cliente. Un teléfono duplicado abre la ficha existente; no fusionar clientes automáticamente.
- Nuevo módulo Clientes: listado con búsqueda por nombre/teléfono, Agregar, Editar, Ver detalles y Eliminar. Nombre y teléfono obligatorios en la ficha; dirección opcional. Ventana flotante con datos generales, historial de pedidos y cambios. Mostrar fecha, centro, folio, estado e importe de cada pedido y abrir sus productos, cantidades, notas, pagos y totales en detalle. El historial incluye los pedidos en papelera con esa indicación.
- El historial de cambios del cliente muestra cada campo modificado, valor anterior y nuevo, fecha/hora de Guatemala y usuario responsable. Incluir creación, envío a papelera y restauración. No permitir editar o borrar este historial desde el módulo.
- Los datos del pedido se guardan como copia de nombre/teléfono/dirección, además del vínculo al cliente. Editar la ficha no cambia pedidos ni recibos anteriores. Los pedidos existentes continúan funcionando sin cliente vinculado; no inventar teléfonos ni asociarlos por nombre.

## Papelera del sistema

Sección nueva llamada **Papelera**, inicialmente para Clientes y Pedidos, con filtro por tipo, búsqueda, fecha, motivo y autor del retiro. Permite consultar el detalle y restaurar. No incluye vaciado permanente ni cambia el borrado actual de productos, categorías o usuarios en esta entrega.

- Solo ADMIN y GERENTE pueden enviar registros a papelera, verla y restaurar; la API impone los permisos, además de ocultar botones. Motivo obligatorio y confirmación con identificación del registro.
- Pedidos: buscar por fecha, folio, nombre y teléfono; el folio se presenta junto con fecha y centro porque se repite cada día. Enviar a papelera solo pedidos PAGADOS o ANULADOS. Un pedido pendiente debe pasar por la anulación existente, con sus controles de pagos y motivo, antes de retirarlo. Tampoco se permite retirar un pedido con preparación pendiente: debe estar entregado o anulado.
- Retirar un pedido es quitarlo de las listas habituales, sin borrar líneas, pagos, folio, vouchers ni auditoría. Sigue contando en cierres, reportes, conciliación y controles contra duplicados. La consulta de la papelera conserva su detalle completo. Los reportes permiten identificar que el pedido está en papelera.
- Restaurar un pedido solo recupera su visibilidad. No cambia su estado de pago, no devuelve dinero, no reabre un pedido anulado ni lo reenvía a Cocina.
- Retirar un cliente impide seleccionarlo para ventas nuevas y lo oculta de la lista habitual. Conserva ficha, cambios y pedidos relacionados. No retira sus pedidos ni cambia sus importes. Si el teléfono corresponde a una ficha en papelera, indicar que un gerente debe restaurarla en lugar de crear un duplicado.
- Reintentar retirar/restaurar no duplica acciones ni historial. Si cambió el registro desde que se abrió, pedir actualizar antes de sobrescribir. Restauración, cambios y pedidos se coordinan con transacciones y bloqueo/versionado.

## Permisos propuestos

| Acción | ADMIN | GERENTE | CAJERO | MESERO | COCINA |
| --- | --- | --- | --- | --- | --- |
| Buscar/seleccionar cliente en Ventas | Sí | Sí | Sí | Sí | No |
| Agregar/editar ficha | Sí | Sí | Sí | Sí | No |
| Consultar módulo Clientes e historial comercial | Sí | Sí | Sí | No | No |
| Consultar historial de cambios | Sí | Sí | No | No | No |
| Enviar cliente/pedido a papelera | Sí | Sí | No | No | No |
| Consultar papelera/restaurar | Sí | Sí | No | No | No |

Las restricciones individuales existentes pueden reducir estos accesos; no los amplían. La búsqueda desde Ventas para MESERO no expone datos de pagos ni el historial completo.

## Cambios de base que requieren aprobación

1. Tabla `ventas.cliente`: UUID, `centro_venta_id`, `nombre` (100), `telefono` (30), `telefono_normalizado` (30), `direccion` (300), `creado_por`, `creado_en`, `actualizado_por`, `actualizado_en`, `version`, `eliminado_por`, `eliminado_en` y `motivo_eliminacion` (300). Relacionar usuarios y centro. Teléfono normalizado único por centro, incluyendo fichas en papelera. Índices para búsquedas e integridad de marcas de eliminación.
2. En `ventas.pedido`, añadir `cliente_id` opcional, `cliente_telefono` (30) y `cliente_direccion` (300) opcionales; conservar `cliente_nombre` como copia histórica. Añadir `eliminado_por`, `eliminado_en` y `motivo_eliminacion` (300). Mantener UUID, estados, folios, pagos y relaciones existentes.
3. Tabla `ventas.cliente_cambio`: identificador, cliente/centro, operación, campo, valor anterior, valor nuevo, usuario y fecha. Registros de cambios y ficha se escriben en la misma transacción. No duplicar cambios cuando el valor no cambió. Acceso de lectura restringido y sin endpoints de modificación/borrado.
4. Incorporar auditoría a los cambios de clientes y movimientos a papelera con el usuario de la sesión; conservar auditoría actual de pedidos. Reutilizar la función de auditoría existente si satisface los datos requeridos, sin alterar reglas de cobro. No ampliar estados del pedido ni tocar cálculos/folios.
5. SQL incremental nuevo en `db/07_clientes_papelera.sql`, junto con actualización de la fuente de verdad `db/01_esquema_v0.3.sql` y Prisma. Revisar permisos del usuario de aplicación para las tablas nuevas. Respaldo privado previo a aplicar el SQL local. No usar migraciones destructivas ni limpiar ventas.

## Orden de implementación y comprobación

1. Tras aprobación explícita del cambio de base: SQL, respaldo, Prisma y API de clientes con búsquedas, auditoría y permisos por centro.
2. Ventas: captura/búsqueda, creación/vínculo idempotente, borrador recuperable y copia histórica de datos. Actualizar recibo y detalle del pedido.
3. Módulo Clientes con formularios flotantes, historial comercial y cambios por campo; protección de cambios sin guardar y conflictos entre editores.
4. Papelera: retiro/restauración de clientes y pedidos, búsqueda/detalles, filtros de listas operativas y preservación de reportes/cierres.
5. Pruebas de integración en bases aisladas: permisos/centros, datos inválidos, duplicados concurrentes, reintentos, auditoría, copias históricas, retiro/restauración sin alterar pagos/reportes, bloqueo de pedidos pendientes y clientes eliminados. Pruebas web de búsqueda/selección, ventanas, borradores, errores y permisos. Build/lint y guía de validación manual.

Listo cuando todas las funciones anteriores se hayan implementado y probado, la base comercial conserve sus datos y los controles de cobro sigan pasando. La aprobación de este documento autoriza únicamente este alcance local; la publicación sigue pospuesta.
