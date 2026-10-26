# Especificación — SirInventari (Sistema de Ventas)

Resumen de la página de Notion "SISTEMA DE VENTAS" (decisión del 24 de octubre de 2026).
Fuente completa: https://app.notion.com/p/3b1cd10c45778024b427e09054880f6e

## 1. Objetivo

Reemplazar las boletas de papel por **pedidos digitales con folio**, ligar cada cobro del POS a un pedido y detectar **cobros duplicados** con una conciliación diaria. Todo centralizado por **centro de venta**, en la nube y con alta disponibilidad.

| Lo que pasa hoy | Lo que hace el sistema |
|---|---|
| Las boletas se pierden | Cada pedido es digital, con **folio único por centro y día**, hora y usuario que lo tomó. |
| No hay registro de ventas ni de su tipo | Cada pedido lleva **tipo de venta** (mesa, para llevar, domicilio, app) y hay reportes por centro, hora y producto. |
| El cliente pide algo más y no queda registro | Lo agregado es una **línea nueva en el mismo pedido**, con hora y quién la agregó. |
| El cobro solo queda en el POS | El cajero registra el **número de autorización del voucher** dentro del pedido. |
| Riesgo de cobros duplicados | Bloqueos automáticos (pedido ya pagado, voucher ya usado, monto mayor al saldo) y **conciliación diaria** contra el cierre del POS. |

## 2. Arquitectura

**Aplicación web en la nube con modo sin internet**, organizada por centros de venta:

- Una sola base de datos central; cada pedido, cobro y usuario pertenece a un centro.
- El **POS externo se mantiene** para cobrar con tarjeta. El sistema no lo reemplaza, lo concilia.
- La app es una **PWA** (app web instalable) que sigue vendiendo aunque se caiga el internet.
- Cada centro tiene un **router con dos salidas** (línea fija + chip 4G).
- Una **impresora térmica** en la caja imprime la comanda cuando no hay internet.
- Se eligió la nube (y no un servidor propio) porque con varios centros un servidor local sería el punto débil: si falla, todos los centros quedan sin sistema.

## 3. Stack tecnológico

| Capa | Tecnología | Para qué sirve |
|---|---|---|
| App (frontend) | React + Vite + TypeScript, como PWA | Una sola app para tablet, celular y PC. |
| Diseño de pantallas | Tailwind CSS + shadcn/ui | Componentes listos y consistentes. |
| Modo sin internet | IndexedDB (Dexie.js) + Service Worker (Workbox) + cola de sincronización | Guardar pedidos y cobros en la tablet y enviarlos al volver el internet. |
| Internet de respaldo | Router con línea fija + chip 4G | Cambia solo al 4G si se cae la línea. |
| Impresión de comandas | Impresora térmica en la caja (USB o Bluetooth) | Reemplaza la pantalla de cocina sin internet. |
| Login | Firebase Authentication | El rol y el centro de venta viajan en el token. |
| API (backend) | Node.js + NestJS (TypeScript) | Reglas de negocio: pedidos, cobros, cierres, reportes. |
| Acceso a datos | Prisma (o TypeORM) | Conectar la API con la base de datos. |
| Base de datos | PostgreSQL 16 en Cloud SQL con HA | Base central con copia en espera en otra zona. |
| Tiempo real | Socket.IO (WebSockets) | Avisar a cocina y caja al instante. |
| Servidor de la API | Google Cloud Run (Docker) | Contenedores que escalan solos. |
| Hosting de la app | Firebase Hosting | Publicar la app con HTTPS y CDN. |
| Archivos | Cloud Storage | Fotos de vouchers y cierres del POS. |
| Publicación automática | GitHub + GitHub Actions | Probar y publicar cada cambio. |
| Monitoreo | Cloud Logging + Monitoring, Sentry | Alertas cuando algo falla o va lento. |
| Reportes | Pantallas propias + Looker Studio | Ventas por centro, tipo, hora y producto. |

Se eligió **Google Cloud** porque el login es Firebase (también de Google): un solo proyecto y una sola factura. Se eligió **PostgreSQL** porque es gratis, robusto y usa SQL estándar.

## 4. Modo sin internet

### Tres niveles de continuidad

| Nivel | Qué pasa | Qué nota el personal |
|---|---|---|
| 1 · Internet con respaldo 4G | Si se cae la línea fija, el router cambia solo al 4G. | Nada. Todo sigue en tiempo real. |
| 2 · Modo sin internet en la app | Si también falla el 4G, cada pedido y cobro se guarda en la tablet con **folio provisional** (ej. `CAJA1-0007`) y se envía solo al volver la conexión. | Aviso "Sin internet". La caja toma y cobra (**modo mostrador**) e imprime la comanda. |
| 3 · Talonario de emergencia | Si la tablet se apaga o daña, se usa un talonario numerado y luego se digita como **MANUAL**. | Papel solo por ese rato, con numeración controlada. |

### Qué funciona sin internet

- ✅ Tomar pedidos y agregar productos.
- ✅ Cobrar en efectivo, y con tarjeta si el POS tiene su propia conexión.
- ✅ Imprimir comanda y comprobante con folio provisional.
- ✅ Ver menú y precios (quedan guardados en la tablet).
- ❌ Que un dispositivo vea lo que hizo otro.
- ❌ Pantalla de cocina en tiempo real (se usa la comanda impresa).
- ❌ Reportes y cierres en vivo del gerente.
- ❌ Iniciar sesión por primera vez en un dispositivo.
- ❌ Recibir cambios de menú o precios hechos durante la caída.

### Reglas de operación

- **Folio provisional:** cada dispositivo tiene un código (`CAJA1`, `TAB01`) y numera sus pedidos sin internet (`CAJA1-0001`…). Al sincronizar recibe el folio definitivo; los dos quedan guardados.
- **La hora es la del dispositivo:** el pedido guarda la hora real en que se tomó, no la hora en que llegó a la nube.
- **Orden de envío:** todo se envía en el orden en que se hizo; el pedido siempre antes que su pago.
- **Reenviar es seguro:** si algo llega dos veces, la nube responde "ya existía" y no lo duplica (los IDs son UUID creados en el dispositivo).
- **Nada se pierde:** lo que no se pueda aplicar va a la **bandeja de conflictos** del gerente, con el motivo en lenguaje claro.
- **Tablet perdida:** el gerente la desactiva; lo que envíe queda en la bandeja para revisión.
- **Alerta:** si un dispositivo no sincroniza en más de 15 minutos, el gerente recibe un aviso.

> **Limitación:** sin internet cada dispositivo trabaja solo. Por eso, durante una caída, la caja trabaja en modo mostrador (toma y cobra).

## 5. Las 5 capas contra cobros duplicados

1. **En el dispositivo:** cada pedido tiene un ID único (UUID) creado en la tablet; si se reenvía, el servidor lo reconoce.
2. **En la API:** antes de guardar un pago revisa si el pedido ya está pagado, si el voucher ya se usó y si el monto excede el saldo.
3. **En la base de datos:** índices únicos y triggers repiten esas validaciones. Es la última línea de defensa.
4. **Al volver el internet:** la sincronización ignora lo que ya llegó y manda a la bandeja de conflictos lo que choca con una regla.
5. **Al cierre del día:** se importa el reporte del POS y se cruza contra los pagos. Un cobro del POS sin pedido es señal de posible doble cobro.

## 6. Base de datos (v0.3)

El script completo está en `db/01_esquema_v0.3.sql` y los datos iniciales en `db/02_datos_iniciales.sql`.

- **Organización:** `centro_venta`, `usuario`, `usuario_centro`, `dispositivo`
- **Catálogo:** `categoria`, `producto`, `producto_centro`, `tipo_venta`, `metodo_pago`
- **Ventas:** `turno_caja`, `folio_contador`, `pedido`, `pedido_detalle`, `pago`
- **Control:** `pos_transaccion`, `sync_conflicto`, `auditoria`
- **Funciones:** `fecha_guatemala`, `usuario_en_centro`, `siguiente_folio`, `calcular_pedido`, `validar_linea`, `recalcular_total_pedido`, `validar_pago`, `proteger_pago`, `pago_anulado`, `fn_auditoria`, `registrar_conflicto`, `motivo_conflicto`, `sync_pedido`, `sync_pago`

La v0.3 corrige los 8 puntos de la revisión: no mezcla centros, la tarjeta exige voucher y terminal, los pagos solo se anulan (no se editan ni borran), el total siempre se recalcula y no baja de lo cobrado, no se cobra en turnos cerrados (un cobro atrasado va a la bandeja), la fecha usa la hora de Guatemala, una línea no cambia de pedido y reenviar una línea no crea conflictos falsos.

## 7. Hoja de ruta por fases

1. **Fase 0 · Definición:** responder las preguntas pendientes, dibujar las pantallas (mesero, cocina, caja, gerente) y validarlas con el personal.
2. **Fase 1 · MVP en un centro piloto:** login, catálogo, pedidos con folio, pantalla de cocina, caja con número de autorización, apertura y cierre de turno, reporte de ventas por tipo. La app trabaja en línea, pero la base de datos ya está preparada para el modo sin internet.
3. **Fase 2 · Conciliación y control:** importar el cierre del POS, reporte de diferencias, anulaciones con autorización del gerente y consulta de auditoría.
4. **Fase 3 · Alta disponibilidad:** modo sin internet completo en la app (cola, folio provisional, comanda impresa, bandeja de conflictos), HA en la base de datos, monitoreo y segundo centro.
5. **Fase 4 · Crecimiento:** más centros, servidor local de contingencia, tableros avanzados, integración con el POS, factura electrónica (FEL) e inventario.

## 8. Preguntas pendientes

- ¿Cuántos centros y dispositivos por centro hay hoy?
- ¿Qué POS usan? ¿Exporta el cierre en CSV/Excel o tiene API?
- ¿El POS emite la factura electrónica (FEL) o la tendría que emitir el sistema?
- ¿Qué tan estable es el internet en cada centro?
- ¿El POS tiene su propia conexión?
- ¿Tienen impresora térmica?
- Durante una caída, ¿la caja trabaja en modo mostrador o los meseros siguen tomando pedidos?
- ¿El menú y los precios son iguales en todos los centros?
- ¿Algún centro opera después de medianoche? (afecta la fecha de operación)
- ¿Se necesita descontar inventario por venta?
