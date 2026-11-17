# Simulador de comisiones Cubo

Ampliación de Reportes solicitada el 16 de noviembre de 2026. Disponible para ADMIN y GERENTE, en el centro seleccionado. No cambia tablas, funciones, pagos ni pedidos.

## Uso

1. En **Reportes**, elige Desde y Hasta (o Hoy, Ayer, Esta semana, Este mes). Para un día, usa la misma fecha en ambos campos.
2. Abre la ficha **Comisiones Cubo**. En **Simulador de comisiones**, deja Terminal POS vacía para incluir todas las terminales de tarjeta, o escribe la terminal que usaste al cobrar en Caja.
3. Pulsa **Calcular comisiones**. Verás lo cobrado, comisión, IVA de la comisión, descuento total y depósito estimado, con detalle diario.
4. Para incluir pedidos específicos, abre **Filtrar por pedidos**. Busca por folio, cliente o fecha, marca pedidos y pulsa **Calcular selección**. **Seleccionar solo resultados** reemplaza la selección por los pedidos de la búsqueda; **Seleccionar todos** recupera todos los pedidos del rango y terminal. Se admiten hasta 100 pedidos individuales o todos.
5. **Descargar CSV de comisiones** exporta exactamente el cálculo vigente, su desglose diario y los cobros con fecha, folio, terminal y autorización.

Cambiar fechas, centro o terminal descarta la simulación anterior. Cambiar la selección oculta los importes y deshabilita la descarga hasta recalcular. Buscar en la lista solo localiza pedidos: hay que seleccionarlos para cambiar el cálculo.

## Fichas de Reportes

Reportes está separado en cinco fichas para mostrar un apartado a la vez:

- **Ventas:** indicadores y desglose por tipo, hora, producto y forma de pago.
- **Pedidos e historial:** pedidos cobrados y movimientos de cada pedido.
- **Comisiones Cubo:** simulador, selección de pedidos y CSV de comisiones.
- **Control de ventas:** comparación de períodos, centros y excepciones.
- **Anulaciones:** productos, pagos y pedidos anulados, responsables y motivos.

Las fechas se comparten entre fichas. Cada reporte mantiene su botón de consulta y descarga. Cambiar de ficha conserva las consultas y selecciones; cambiar el período reinicia comisiones, control y anulaciones para volver a consultarlos. Ventas e historial muestran el rango que se consultó. Con teclado, las flechas izquierda/derecha cambian de ficha; Inicio y Fin llevan a la primera y última. En pantallas pequeñas la barra de fichas se puede desplazar horizontalmente.

## Cálculo solicitado

Para cada día, se suman los cobros incluidos:

- Comisión = cobrado por POS × 5.50%, redondeada a dos decimales.
- IVA de la comisión = comisión × 12%, redondeado a dos decimales.
- Descuento total = comisión + IVA de la comisión.
- Depósito estimado = cobrado por POS − descuento total.

Ejemplo: Q1,000.00 cobrados → Q55.00 de comisión + Q6.60 de IVA → Q61.60 de descuento → **Q938.40 por recibir**.

Se usa aritmética decimal y medio centavo se redondea hacia arriba. Primero se suman los cobros del día; no se redondea la comisión por voucher. El total de un rango suma los resultados diarios para que cuadre con el detalle.

## Qué cobros incluye

- Solo pagos con método TARJETA y estado APLICADO del centro actual. Efectivo, transferencias y pagos anulados se excluyen.
- Usa `pago.fecha_operacion`, calculada por el sistema con la hora de Guatemala; no usa la fecha de creación del pedido ni el día UTC.
- Incluye abonos aunque el pedido tenga saldo pendiente. En pagos divididos, solo toma la parte cobrada por tarjeta.
- Conserva cobros de pedidos en papelera y los identifica en la selección. Muestra la fecha del pedido junto al folio para distinguir folios repetidos en días diferentes.
- Sin filtro de terminal aplica la tarifa indicada por el usuario a **todos los cobros por tarjeta**. La base actual no tiene un catálogo de proveedores de POS; escribir CUBO no incluye automáticamente otras terminales con nombres diferentes.
- Es una estimación con la tarifa proporcionada por el negocio; no registra gastos, confirma depósitos ni sustituye la conciliación con el archivo real de Cubo (Tarea 14 pendiente).

## Archivos cambiados

- `apps/api/src/reportes/reportes.controller.ts`: nueva consulta de comisiones.
- `apps/api/src/reportes/reportes.service.ts`: cobros por fecha, centro, terminal y pedidos.
- `apps/api/src/reportes/comisiones.ts`: cálculo decimal diario.
- `apps/api/src/reportes/comisiones.spec.ts`: pruebas de importes y redondeo.
- `apps/api/test/comisiones.e2e-spec.ts`: pruebas con cobros y centros en una base temporal.
- `apps/web/src/componentes/SimuladorComisiones.tsx`: pantalla, selección y CSV.
- `apps/web/src/paginas/Reportes.tsx`: integración del apartado.
- `apps/web/src/pruebas/comisiones.test.tsx`: pruebas de filtros, errores, cambio de fechas y descarga.
- `docs/plan.md`, `ESTADO.md` y esta guía: alcance, relevo y uso.
