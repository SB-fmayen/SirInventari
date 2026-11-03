# Mejoras aprobadas por el usuario

El usuario aprobó todas las propuestas I1–I3, P1–P5, C1–C4, CA1–CA5, T1–T4, CT1–CT5, R1–R5 y U1–U5, con autorización para implementarlas. Se aplican por bloques y se conserva el historial de ventas.

## Decisiones de operación

- Cerrar un turno con pedidos abiertos genera una advertencia y exige confirmarla; no obliga a cerrar las cuentas de otras mesas.
- Las diferencias de efectivo requieren motivo. Retiros e ingresos requieren monto positivo, motivo y turno abierto; no alteran las ventas reportadas.
- Cortesías y correcciones de cocina requieren gerente o administrador. Las cortesías finalizan pedidos sin pagos positivos, con motivo y auditoría; no se inventan pagos de cero.
- Las anulaciones de pagos son registros internos. Nunca ejecutan una devolución ni una anulación en el POS externo.
- La eliminación se limita a registros sin historial; usuarios con actividad y productos vendidos se desactivan. Eliminar de SirInventari no elimina automáticamente la cuenta de Firebase.
- Los permisos específicos restringen acciones dentro del alcance del rol; no conceden acceso a módulos o centros no autorizados. ADMIN conserva acceso para administrar el sistema.
- Fotos opcionales almacenadas localmente en la base como imágenes pequeñas; no se contratan servicios ni se crean recursos de pago.
- Borrador recuperable es una ayuda local; no se presenta como venta sin internet ni envía productos a Cocina hasta guardar.

## Seguimiento y dónde usar cada mejora

Implementadas las 36 mejoras. «Implementada» indica código y comprobaciones automáticas disponibles; la validación visual/operativa con el usuario sigue pendiente.

| Códigos | Módulo | Uso |
|---|---|---|
| I1–I3 | Inicio | Resumen según rol, acceso rápido a pedido/caja/cocina y solicitudes. La navegación, recarga, cambio de centro y cierre de sesión avisan de cambios sin guardar. |
| P1 | Pedidos | Botones de filtros con contadores de cobro y preparación. |
| P2 | Pedidos | Botones +/− y selector de notas frecuentes en cada línea; no se fusionan notas distintas. |
| P3 | Pedidos | «Recuperar borrador»: guardado local separado por usuario y centro. Solo el pedido nuevo se conserva automáticamente; los agregados a pedidos existentes se protegen al salir. No se envía a Cocina antes de guardar. |
| P4 | Pedidos | «Incluir abiertos de días anteriores», con fecha en las tarjetas. |
| P5 | Pedidos | «Ver mesas con pedidos abiertos»; selección exacta de mesa. Unir o trasladar cuentas no forma parte de esta mejora. |
| C1–C3 | Cocina | Activar/silenciar sonidos, umbral de demora, filtro por tipo de venta y pantalla completa. El navegador exige activar el audio con un toque; audio y pantalla completa dependen de su soporte. |
| C4 | Cocina | «Corregir avance de cocina» crea solicitud con motivo. Gerente/ADMIN pueden autorizar; no modifica el cobro. |
| CA1–CA2 | Caja | Resumen del cobro, importe exacto y efectivo recibido de Q20/Q50/Q100/Q200. |
| CA3 | Caja | «Consultar comprobantes anteriores» por fecha; se filtran con la búsqueda por folio/mesa/cliente. |
| CA4 | Caja | «Finalizar pedido gratuito» o «Solicitar cortesía completa». Exige productos activos, motivo y autorización. Sin pagos aplicados; aplica descuento por el subtotal y finaliza sin crear un pago cero. |
| CA5 | Caja | Solicitar anulación junto al pago del comprobante. Gerente/ADMIN resuelven; el registro queda anulado con responsable/motivo. Solo con el turno original abierto, para no alterar cierres históricos. No ejecuta devolución ni operación del POS. |
| T1–T3 | Turnos | Conteo por denominaciones, revisión/confirmación de pedidos abiertos, motivo obligatorio si hay diferencia y consulta de motivos del historial. |
| T4 | Turnos | «Ingresos y retiros de efectivo», con monto positivo, motivo y responsable. El retiro no puede superar efectivo esperado; reintentos con el mismo UUID no duplican. |
| CT1–CT2 | Catálogo | Filtro por estado y botón «Marcar agotado/disponible» del centro. |
| CT3 | Catálogo/Pedidos | En el producto, definir «Grupo de variantes o tamaños» y si es complemento. En Pedidos, elegir familia y luego su opción/tamaño, o mostrar extras. Los tamaños existentes de Shuko se agrupan por nombre cuando coincide su sufijo; el grupo editable permite corregirlo sin cambiar productos vendidos. |
| CT4 | Catálogo | «Actualizar precios con vista previa»: escribir los nuevos precios de productos filtrados, elegir base o centro y confirmar revisión. Una vista previa desactualizada rechaza todo el lote, sin cambios parciales. |
| CT5 | Catálogo | Foto opcional PNG/JPEG/WebP de hasta 200 KB; vista previa y quitar foto. Se valida formato y contenido, y se muestra también en Pedidos. Se almacena en la base, sin contratar almacenamiento externo. |
| R1–R2 | Reportes | Hoy/Ayer/Esta semana/Este mes y control comparativo con período anterior de igual duración. |
| R3 | Reportes | En «Consultar control de ventas», listado y búsqueda de anulaciones/cortesías/descuentos con usuario, motivo, fecha e importe; descarga CSV. |
| R4 | Reportes | «Consolidar todos mis centros autorizados» muestra comparativa por centro; la API limita los centros al usuario. |
| R5 | Reportes | Ventas pagadas por fecha del pedido, pagos aplicados por fecha del cobro y saldo actual de pedidos creados en el rango. No se presenta como saldo histórico reconstruido. |
| U1 | Usuarios | Filtros de nombre/correo, rol, estado y centro. |
| U2 | Usuarios | Impide quitar el último ADMIN activo, incluso con cambios de rol simultáneos. |
| U3 | Usuarios | Aviso cuando Firebase no se sincroniza y botón de reintento de la misma activación/desactivación. La base sigue bloqueando usuarios desactivados. |
| U4 | Usuarios/Catálogo | Eliminar desde ADMIN usuarios desactivados, productos no vendidos o categorías sin productos. Relaciones/historial bloquean el borrado; nunca elimina pedidos/pagos ni cuentas de Firebase. |
| U5 | Usuarios | Editar usuario → «Permisos específicos»: restringir ver/crear/editar/anular/autorizar dentro del rol. ADMIN conserva acceso; una casilla no puede conceder módulos/centros ajenos. La API aplica el cambio inmediatamente; recargar sesión actualiza el menú. |

## Verificación y límites

- 83 pruebas de integración en bases aisladas, 14 unitarias de API y 59 de app correctas. Build/lint de ambas aplicaciones correctos, con los avisos web previos de lint y tamaño de paquete.
- Pruebas nuevas: último ADMIN concurrente; permisos en API; cortesía y solicitudes idempotentes; eliminación protegida; movimientos/retiros concurrentes; lote de precios atómico; fotos/variantes; anulación de pago sin borrar; rechazo de turno cerrado, versión antigua y centro ajeno; pedidos anteriores y consolidado autorizado; recuperación de borrador; navegación que conserva cambios; revisión de precios y reintento de solicitud con el mismo UUID.
- SQL repetible probado primero con ROLLBACK; respaldo privado previo en `logs/`; aplicado en la base local. El esquema fuente incluye el mismo bloque. No se crearon ventas de prueba en la base del usuario.
- Revisión visual pendiente: el acceso al navegador no estuvo disponible y el intento por la ventana de Chrome se detuvo porque la herramienta no pudo verificar la URL con suficiente confianza. No se afirma inspección visual de estas mejoras.
- Las funciones futuras del plan (conciliación POS, modo sin internet completo, autorización de todas las anulaciones de líneas e impresora) conservan sus requisitos y no se declaran terminadas por esta aprobación. La anulación directa de líneas sigue su regla actual por rol; el nuevo sistema de solicitudes prepara su autorización de Tarea 15.
- Referencia técnica de protección de navegación: [useBlocker de React Router](https://reactrouter.com/api/hooks/useBlocker). Se usa el router de datos de la misma librería y se protege también la recarga con `beforeunload`.

## Validación con el usuario

1. Recargar http://localhost:5173 y entrar con la cuenta existente. Revisar resumen de Inicio y abrir Nuevo pedido desde su acceso rápido.
2. Agregar productos con cantidades/notas distintas, probar búsqueda, variantes/extras y filtros. Intentar cambiar de módulo y elegir quedarse. Recargar aceptando la advertencia y recuperar el borrador; comprobar que no apareció en Cocina sin enviarlo.
3. Enviar el pedido y verlo en otra pestaña de Cocina. Activar audio con un toque, probar agregado NUEVO, umbral de demora y pantalla completa. Solicitar una corrección y autorizarla desde Inicio con GERENTE/ADMIN.
4. En Caja, revisar folio/fecha/mesa y saldo, usar importe exacto y denominaciones, dividir el pago y consultar el comprobante por fecha. Para una prueba de cortesía usar un pedido identificado como prueba con autorización; no anular un cobro real del POS solo para probar la interfaz.
5. En Turnos, revisar denominaciones y efectivo esperado; registrar movimientos únicamente si corresponden al efectivo real. Probar la validación de motivo de diferencia y la revisión de pedidos antes de confirmar un cierre.
6. En Catálogo, revisar filtro de agotados, foto pequeña y grupo de variantes. Revisar la vista previa de precios sin aplicarla hasta confirmar los precios comerciales correctos.
7. En Reportes, consultar fechas rápidas, control/comparación y CSV. Verificar que el consolidado de GERENTE solo muestre sus centros y distinguir ventas/pagos/saldo según las definiciones de la pantalla.
8. En Usuarios, revisar filtros, restricciones por acción y mensaje de sincronización. Validar eliminación con un registro nuevo de prueba sin historial, nunca con usuarios operativos. Confirmar que el último administrador no se pueda degradar ni eliminar.

## Archivos principales cambiados

- Base: `db/01_esquema_v0.3.sql`, `db/06_mejoras_modulos.sql`, `apps/api/prisma/schema.prisma`, `apps/api/scripts/aplicar-mejoras-modulos.mjs`.
- API: `src/control/control.module.ts`, `src/app.module.ts`, `src/main.ts`; guard/tipos/verificador de `src/autenticacion/`; `usuarios.service.ts`, controladores/servicios de Pedidos, Caja, Turnos, Catálogo y Reportes y validación de Catálogo.
- Web: `src/App.tsx`, `src/main.tsx`, `src/sesion/SesionProvider.tsx` y `tipos.ts`; las siete pantallas operativas y `Inicio.tsx`; componentes `AccionControl.tsx`, `AdministracionRegistros.tsx`, `ControlVentas.tsx`, `ProteccionNavegacion.tsx`; hook `useCambiosSinGuardar.ts` y utilidades `borrador.ts`/`fechas.ts`.
- Pruebas: `apps/api/test/mejoras.e2e-spec.ts`, ajustes en pruebas de Caja/Turnos y verificador Firebase; `apps/web/src/pruebas/mejoras.test.tsx` y prueba de cierre en `app.test.tsx`.
- Guías: este archivo, `docs/roles-y-accesos.md` y `ESTADO.md`.
