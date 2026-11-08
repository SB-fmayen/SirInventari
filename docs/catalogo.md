# Catálogo: productos y categorías

Actualizado el 2026-11-07 por solicitud del usuario. No cambia el esquema ni los permisos de la API.

## Organización

- **Productos:** búsqueda por nombre/SKU, categoría y estado; contador de resultados y Limpiar filtros. La tabla destaca el precio de venta del centro y muestra si usa el precio base o uno propio. Acciones: Editar, Desactivar/Activar, Agotado/Disponible y Eliminar (ADMIN).
- **Categorías:** sección independiente con nombre, orden, cantidad de productos y estado. Cada categoría tiene Editar, Desactivar/Activar y Eliminar (ADMIN).
- La actualización de precios por lote conserva su vista previa y queda al final de Productos.

## Edición

Editar abre una ventana centrada con desplazamiento propio y encabezado visible, para que el formulario no quede perdido al inicio de una lista larga. Los errores y confirmaciones aparecen dentro de esa ventana.

En productos hay dos guardados identificados: **Guardar producto** para nombre, SKU, categoría, precio base, estado y opciones generales; **Guardar para este centro** para precio propio y disponibilidad local. Guardar una sección conserva la otra abierta con sus cambios pendientes; Cerrar/Cancelar/Escape pide confirmación cuando quedan cambios. Guardar correctamente una sección limpia solo su aviso de cambios pendientes.

Foto, variantes y complementos se encuentran en el desplegable opcional. Los campos se bloquean mientras se guarda. Si la API rechaza la edición, el editor conserva los valores y muestra el mensaje para corregir o reintentar.

## Estados y eliminación

- **Desactivar producto:** retira de venta en todos los centros, conservando historial. Activar permite volver a ofrecerlo, siempre que categoría y disponibilidad también lo permitan.
- **Desactivar categoría:** impide vender sus productos; no elimina ni desactiva individualmente cada producto. Activar restablece la categoría.
- **Agotado:** cambia solo la disponibilidad del centro actual.
- **Eliminar:** texto corto en el botón. La confirmación identifica el producto/categoría; la API sigue impidiendo borrar productos vendidos o categorías con productos. GERENTE puede editar/desactivar, pero la eliminación sigue siendo de ADMIN.

## Validación

Pruebas de interfaz: editar producto y categoría, conservar cambios entre ambos formularios, confirmar salida, activar/desactivar, eliminación con historial bloqueada, errores visibles y límites por rol. Integración del catálogo en una base aislada: editar categorías/productos, precios por centro, desactivación y permisos. No se modifican productos comerciales para ejecutar estas pruebas.

Pendiente validación visual y operativa con el usuario en su sesión real. Las pruebas automáticas no sustituyen esa revisión.

Resultado: 75 pruebas web correctas (`--maxWorkers=1`) y 5 de integración de Catálogo correctas; compilación web y lint web/API correctos, con los avisos web anteriores. La ejecución paralela previa tuvo un timeout en Mostrador; no se cambió el caso ni su límite para repetirlo.
