# Pruebas manuales del centro piloto

Estas pruebas son para desarrollo o un centro de prueba. Usar el POS en modo de prueba y vouchers de prueba. No registrar cobros ficticios en una jornada real.

## Preparación

1. Abrir Docker Desktop y ejecutar `docker compose up -d` en la raíz.
2. En `apps/api`: `npm.cmd install` si faltan dependencias y `npm.cmd run start:dev`.
3. En `apps/web`: `npm.cmd install` si faltan dependencias y `npm.cmd run dev`.
4. Abrir `http://localhost:5173`. Debe aparecer Iniciar sesión; al entrar, API conectada.
5. Usar cuentas de prueba ADMIN, GERENTE, CAJERO, MESERO y COCINA creadas en Firebase y registradas en Usuarios. No compartir contraseñas entre personas.

## Pruebas automáticas antes de empezar

- En `apps/api`: `npm.cmd test`, `npm.cmd run test:e2e`, `npm.cmd run build` y `npm.cmd run lint`.
- En `apps/web`: `npm.cmd test`, `npm.cmd run build` y `npm.cmd run lint`.
- Las pruebas de integración crean bases locales con nombre aleatorio `sirinventari_pruebas_…`, cargan los dos SQL originales y las eliminan al terminar. DATABASE_URL se usa para conectarse al servidor; la cuenta necesita CREATEDB. No ejecutar estas pruebas contra un servidor de producción.
- Los siete casos de `db/pruebas/casos.sql` se ejecutan automáticamente con `test:e2e`, en una base aislada. No hace falta Git Bash ni correr psql a mano.
- Firebase se simula en las pruebas automáticas. El acceso real debe probarse con las cuentas de prueba en el navegador.

## Login, roles y centros

1. Entrar como ADMIN y recargar: la sesión sigue abierta. Cerrar sesión: vuelve al login.
2. Entrar como MESERO: solo aparece Pedidos en el menú de trabajo. Escribir `/caja`, `/usuarios` y `/reportes` a mano: aparece No tienes permiso.
3. Entrar como CAJERO: aparecen Pedidos, Caja y Turnos. No puede administrar usuarios ni consultar reportes.
4. Entrar como GERENTE: puede ver Catálogo y Reportes, pero no Usuarios.
5. Asignar dos centros a una cuenta de prueba: al entrar elige un centro; al cambiarlo cambian precios, pedidos y turnos. Recargar recuerda el centro elegido.
6. Desactivar una cuenta desde ADMIN: sus solicitudes nuevas quedan bloqueadas. Un socket abierto se desconecta antes del siguiente aviso. Volver a entrar o recargar muestra que no tiene acceso.

## Catálogo

1. Crear categoría, cambiar nombre y orden, desactivarla y activarla.
2. Crear producto con SKU único y precio base Q12.50.
3. Elegir otro centro y poner precio propio Q18.75. El primer centro conserva Q12.50 y el segundo muestra Q18.75.
4. Dejar el precio propio vacío: vuelve al base. Poner Q0.00: conserva cero.
5. Marcar No disponible en el segundo centro: desaparece del selector de productos de Pedidos de ese centro.
6. Desactivar producto o categoría: sus productos dejan de ofrecerse al tomar pedidos. La administración conserva el registro.
7. Buscar por nombre o SKU y filtrar por categoría.

## Turnos

1. Abrir turno con Q100.10 de fondo.
2. En dos ventanas, intentar abrir otro turno del mismo centro: solo existe uno; el aviso dice quién lo abrió y cuándo.
3. Abrir un turno de otro centro: es independiente.
4. Tras una venta con Q20.20 en efectivo y el resto con tarjeta, el efectivo esperado es Q120.30.
5. Contar Q120.20 al cerrar: diferencia Q-0.10. No permite volver a cerrar ese turno. El historial conserva quién abrió/cerró y las horas de Guatemala.

## Pedidos

1. Tomar dos pedidos al mismo tiempo en dos ventanas. En un centro nuevo del día reciben folios 1 y 2; en otro caso, dos folios diferentes y consecutivos.
2. Elegir mesa o tipo para llevar/domicilio/app con cliente. Agregar productos, cantidad y notas.
3. Guardar, abrir el detalle y agregar otro producto con otra cuenta: se ve su nombre y hora en la línea nueva.
4. Anular una línea: requiere motivo, la línea permanece marcada Anulada y el total se recalcula.
5. Con un pedido pagado, no aparecen botones para agregar/anular productos y la API también lo rechaza.
6. Ver la lista del día con folio, estado, hora y total; buscar por folio, mesa o cliente.

## Caja y cobros

1. Sin turno abierto, no permite registrar pagos.
2. Elegir un pedido pendiente de Q45.00. Cobrar Q20.00 en efectivo, recibido Q50.00: vuelto Q30.00, pagado Q20.00 y saldo Q25.00.
3. Cobrar los Q25.00 restantes con tarjeta: exige terminal y número de autorización. Queda Pagado y saldo cero.
4. Reutilizar el mismo voucher/terminal/día en otro pedido, incluso con espacios o minúsculas: lo rechaza.
5. Intentar cobrar más del saldo y cobrar un pedido pagado: lo rechaza con un mensaje en español.
6. Dos cajeros cobran el saldo completo al mismo tiempo: solo se aplica uno. Los pagos parciales distintos sí pueden aplicarse si juntos no exceden el saldo.
7. Si se pierde la respuesta de la API después de enviar el pago, conservar la pantalla y tocar Reintentar el mismo pago. Los campos quedan bloqueados y se reutiliza el mismo UUID. Verificar que solo aparece un pago en el comprobante. No repetir manualmente el cobro en el POS.
8. Ver el comprobante: folio, productos, total, pagos, autorización, terminal y saldo.
9. Buscar un pedido pendiente de un día anterior: aparece con su fecha para distinguir folios repetidos de días distintos.

## Reportes

1. Entrar como GERENTE o ADMIN, elegir centro y rango de fechas de operación.
2. Verificar que pedidos pagados, total vendido, ticket promedio y desgloses por tipo/hora/producto/pago coinciden con los comprobantes.
3. Un pedido parcialmente pagado todavía no entra en ventas; entra cuando completa su pago. Anulados no entran.
4. Cambiar centro: no aparecen ventas del centro anterior.
5. Ver historial: quién creó/agregó/cobró, horas y notas.
6. Descargar CSV: abrirlo y revisar acentos, precios, centro, fechas y totales.

## Cocina y tiempo real: pendiente de completar

- Los avisos de nuevos pedidos y agregados ya actualizan Pedidos y Caja sin recargar, solo dentro del centro autorizado.
- Al perder conexión se muestra el aviso de reconexión; al volver se recargan los datos.
- **No aprobar todavía la Fase 1 completa:** faltan la pantalla Cocina, el marcador NUEVO y las transiciones En preparación → Listo → Entregado. Esperan la decisión del esquema indicada en ESTADO.md, porque PAGADO y los estados de cocina comparten actualmente un campo.
- Después de resolverlo, probar dos dispositivos: un pedido nuevo aparece en Cocina sin recargar, un agregado posterior aparece como NUEVO, los cambios de estado llegan a mesero/caja y un pedido cobrado antes de cocinar sigue en Cocina sin volver a abrir su saldo.

El modo sin internet, impresión térmica, conciliación del POS y autorizaciones de gerente pertenecen a las fases siguientes; no están aprobados con esta lista.
