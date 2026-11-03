# Roles y accesos actuales

Verificado contra `apps/web/src/secciones.ts` y los controladores de la API el 2026-11-02. La misma tabla se puede consultar en **Usuarios → Ver accesos de cada rol**.

| Módulo | Administrador | Gerente | Cajero | Mesero | Cocina |
|---|---|---|---|---|---|
| Pedidos | Sí | Sí | Sí | Sí | — |
| Cocina | Sí | Sí | — | — | Sí |
| Caja | Sí | Sí | Sí | — | — |
| Turnos | Sí | Sí | Sí | — | — |
| Catálogo | Sí | Sí | — | — | — |
| Reportes | Sí | Sí | — | — | — |
| Usuarios | Sí | — | — | — | — |

## Acciones dentro de cada módulo

- **Pedidos:** consultar pedidos del día, crear pedidos, agregar productos, cantidades y notas; anular una línea con motivo si el pedido aún lo permite. Actualmente los cuatro roles con acceso pueden anular líneas; la autorización de gerente en ese momento está pendiente de Tarea 15.
- **Cocina:** consultar comandas del centro, pendientes de otros días y entregados de hoy; avanzar de pendiente a preparación, listo y entregado. No muestra importes ni datos de pago y no cambia el estado del cobro.
- **Caja:** buscar pendientes, consultar detalle, registrar efectivo con vuelto, tarjeta o transferencia, dividir pagos y consultar comprobantes. Exige turno abierto y controla saldo y voucher repetido.
- **Turnos:** abrir turno con fondo, cerrar con efectivo contado y consultar historial del centro. Solo puede haber uno abierto por centro.
- **Catálogo:** crear y editar categorías, su orden y estado; crear y editar productos, precio base, estado, precio y disponibilidad por centro. Los cambios generales se comparten entre centros; precio propio y disponibilidad pertenecen al centro elegido.
- **Reportes:** consultar ventas por centro y rango de fechas, formas de pago, tipo de venta, hora y producto; consultar historial del pedido y descargar CSV.
- **Usuarios:** crear usuarios, editar nombre, rol y centros asignados, activar y desactivar. La creación con contraseña requiere credenciales de servicio de Firebase; también se puede registrar un UID existente. No permite desactivarse uno mismo. La lista de centros sirve para asignarlos; no es un módulo para crear o eliminar centros.

El administrador puede trabajar en todos los centros activos. Los otros roles solo pueden trabajar en sus centros asignados. La API también comprueba el acceso: ocultar un enlace del menú no es la única protección.

## Solicitud de eliminación

El usuario aprobó la eliminación controlada: ADMIN puede eliminar usuarios desactivados sin historial, productos sin líneas de venta y categorías sin productos. Se solicita confirmación en la interfaz y se registra la acción. Las relaciones y el historial bloquean el borrado; se conserva la desactivación para esos casos. No se eliminan pedidos/pagos ni cuentas de Firebase.

## Restricciones individuales aprobadas

En Editar usuario → Permisos específicos se pueden restringir acciones dentro del rol. No amplían módulos ni centros autorizados. «Ver» restringe todas las acciones del módulo; «Crear» controla registros nuevos; «Editar» incluye agregar líneas a un pedido, cambios de preparación, cierre de turno y precios; «Anular» controla anulaciones/solicitudes de corrección; «Autorizar» se aplica a resolver solicitudes del módulo en GERENTE. ADMIN conserva sus permisos completos.

Caja tiene cortesías y anulación de pagos con autorización de GERENTE/ADMIN; Cocina permite solicitar retroceso con motivo. Las solicitudes se revisan en Inicio. Cambiar el rol no borra las restricciones individuales: el ADMIN puede revisarlas en el editor.
