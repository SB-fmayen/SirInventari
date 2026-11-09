# Clientes, datos de entrega y papelera

Alcance aprobado expresamente por el usuario el 2026-11-08, incluidos los cambios de base según AGENTS.md, regla 3. Implementado localmente; ver resultados y límites de validación en ESTADO.md.

## Comportamiento

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

## Permisos

| Acción | ADMIN | GERENTE | CAJERO | MESERO | COCINA |
| --- | --- | --- | --- | --- | --- |
| Buscar/seleccionar cliente en Ventas | Sí | Sí | Sí | Sí | No |
| Agregar/editar ficha | Sí | Sí | Sí | Sí | No |
| Consultar módulo Clientes e historial comercial | Sí | Sí | Sí | No | No |
| Consultar historial de cambios | Sí | Sí | No | No | No |
| Enviar cliente/pedido a papelera | Sí | Sí | No | No | No |
| Consultar papelera/restaurar | Sí | Sí | No | No | No |

Las restricciones individuales existentes pueden reducir estos accesos; no los amplían. La búsqueda desde Ventas para MESERO no expone datos de pagos ni el historial completo.

## Cambios de base aprobados

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

## Cómo usarlo y comprobarlo

1. Recargar la app y abrir **Clientes**. Agregar una ficha con nombre y teléfono; la dirección es opcional. Buscar por nombre o teléfono. Los separadores del teléfono no generan un cliente distinto.
2. **Editar** abre una ventana flotante con protección de cambios sin guardar. Si otro usuario cambió la ficha, cerrar el editor, pulsar **Actualizar** y revisar los datos antes de volver a editar.
3. **Ver detalles** abre datos generales, historial de pedidos y, para gerente/ADMIN, cambios por campo con valor anterior, nuevo, responsable y fecha/hora de Guatemala. **Ver detalles del pedido** abre una segunda ventana con productos, notas, precios, pagos y totales.
4. En **Ventas → Nuevo pedido**, escribir teléfono y pulsar **Buscar cliente**, junto al campo. Seleccionar el resultado para completar nombre y dirección. Para un cliente nuevo, escribir los datos y guardar el pedido: ficha y pedido se guardan juntos. Un error conserva el borrador, incluidos los datos de contacto.
5. Si se cambian datos de una ficha seleccionada, marcar **Confirmo actualizar la ficha del cliente con los datos de esta venta**. Se requiere permiso de edición. Dejarla sin marcar no sobrescribe la ficha. Si la ficha cambió en otra sesión, volver a buscarla antes de guardar.
6. Los datos de contacto quedan en el detalle y recibo del pedido. Editar después el cliente no cambia esa copia histórica. Las ventas anónimas siguen disponibles; registrar un teléfono requiere un nombre. Domicilio requiere teléfono y dirección.
7. En **Ventas**, elegir **Fecha de pedidos** y buscar por folio, mesa, nombre o teléfono. Abrir el pedido y usar **Eliminar pedido**. Requiere gerente/ADMIN, motivo y pedido anulado o pagado/entregado. No se anulan ni devuelven pagos desde este botón.
8. En **Clientes**, **Eliminar** envía la ficha a papelera con motivo. Se conservan sus pedidos y cambios; ese teléfono no puede registrarse de nuevo mientras la ficha está en papelera. Un gerente puede restaurarla.
9. En **Papelera**, elegir Clientes o Pedidos, buscar y consultar detalles. La búsqueda incluye motivo y responsable del retiro. Para pedidos se filtra por fecha del pedido; para clientes, por fecha del retiro en hora Guatemala. **Restaurar** recupera la visibilidad sin reabrir pedidos anulados ni enviar comandas nuevas a Cocina. Los listados e historiales se recorren de 50 registros por página.
10. Verificar que cajero no ve botones de eliminar ni historial de cambios; mesero puede buscar/registrar clientes en Ventas, sin módulo de historial comercial; Cocina no accede a clientes ni papelera. Restricciones individuales reducen los accesos existentes.
11. Comprobar que pedidos cobrados retirados siguen incluidos en Reportes y cierres. Reportes los identifica **En papelera**; sus pagos, vouchers y folios se conservan.

No se importaron clientes históricos a partir de nombres repetidos ni se crearon clientes o ventas de prueba en la base comercial. Pruebas de integración en bases desechables. La validación visual con la sesión real del usuario y la impresión física siguen pendientes; la automatización de navegador no estaba disponible en esta sesión.

Aplicación local repetible: `node apps/api/scripts/aplicar-clientes-local.mjs` desde la raíz. Comprueba que sea localhost, crea/verifica un respaldo en logs antes del SQL y no reaplica si ya existe la tabla. Requiere las herramientas PostgreSQL 16 instaladas en su ruta habitual de Windows. Para una base nueva se usa directamente el SQL fuente completo, que ya incluye estos cambios; el script 07 se reserva para bases previas.

## Archivos de esta entrega

- Base: `db/01_esquema_v0.3.sql`, `db/07_clientes_papelera.sql`, `apps/api/prisma/schema.prisma`, `apps/api/scripts/aplicar-clientes-local.mjs`.
- API: `apps/api/src/clientes/clientes.service.ts`, `clientes.module.ts`, `papelera.module.ts`; `apps/api/src/app.module.ts`, `autenticacion/autenticacion.guard.ts`, `comun/errores-bd.ts`, `control/control.module.ts`, `pedidos/pedidos.controller.ts`, `pedidos.module.ts`, `pedidos.service.ts`, `validacion-pedido.ts` y `reportes/reportes.service.ts`.
- App: `apps/web/src/paginas/Clientes.tsx`, `Papelera.tsx`, `Pedidos.tsx`, `Reportes.tsx`; `apps/web/src/componentes/ClientesCompartidos.tsx`, `TicketVenta.tsx`, `AdministracionRegistros.tsx`; `apps/web/src/lib/clientes.ts`, `borrador.ts`; `apps/web/src/App.tsx` y `secciones.ts`.
- Pruebas: `apps/api/test/clientes.e2e-spec.ts`, `apps/web/src/pruebas/clientes.test.tsx`, `mostrador.test.tsx` y `app.test.tsx`.
- Documentación: esta guía, `docs/plan.md` y `ESTADO.md`.
