# Plan del SISTEMA DE VENTAS (modo relevo Claude Code y Codex)

Copiado completo y sin resumir del documento "Modo relevo Claude Code y Codex" (31 de octubre de 2026).
Las tareas marcadas con ★ requieren explicar el plan en pocas líneas antes de empezar.

Actualización del usuario (2026-11-07): primero validar y corregir localmente; despliegue pospuesto. La operación será desde una PC de mostrador. Pedidos y Caja se presentan juntos en Ventas; flujo y validación en `docs/flujo-mostrador.md`. Esta decisión actualiza la interfaz de las tareas 8/10 sin cambiar sus controles de cobro ni declarar terminadas las fases futuras.

Tarea 0 · Preparación: carpetas apps/web, apps/api, db y docs; db/01_esquema_v0.2.sql y db/02_datos_iniciales.sql copiados de Notion sin cambios; docs/especificacion.md con el resumen de la página; AGENTS.md con el proyecto, el stack y las reglas; CLAUDE.md con la línea @AGENTS.md. Listo cuando: existen esos archivos y carpetas.

Actualización solicitada (2026-11-08): Clientes, datos de entrega en Ventas y Papelera. Alcance, permisos, cambios de base y criterios de aceptación en docs/clientes-y-papelera.md. Propuesta pendiente de aprobación de base por regla 3 de AGENTS.md; no implementada todavía. Se intercala por solicitud expresa del usuario antes de continuar el plan general.

## FASE 1 · Sistema básico para el centro piloto

Tarea 1 · Base de datos local: PostgreSQL 16 con Docker Compose, zona horaria America/Guatemala; al iniciar ejecuta los scripts de db/; credenciales en .env y .env.example sin contraseña; pruebas de los 7 casos de la especificación en db/pruebas/casos.sql. Necesita del usuario: Docker Desktop instalado. Listo cuando: los 7 casos dan el resultado esperado.

Tarea 2 ★ · API: NestJS + TypeScript en apps/api; Prisma con prisma db pull, sin migraciones que cambien la base; ruta /salud; los errores de los triggers llegan como mensajes claros en español. Listo cuando: /salud responde que la API y la base funcionan.

Tarea 3 ★ · App: React + Vite + TypeScript + Tailwind CSS + shadcn/ui en apps/web; PWA instalable (el modo sin internet es la Fase 3); menú Pedidos, Cocina, Caja, Turnos, Catálogo y Reportes; diseño para tablet con botones grandes; muestra si se conecta a /salud; textos en español. Listo cuando: la app abre y dice que la API está conectada.

Tarea 4 · Login con Firebase Authentication (correo y contraseña): sesión que se mantiene al recargar; la API verifica el token con Firebase Admin y busca al usuario por firebase_uid con su rol y sus centros (usuario_centro); si no existe o está inactivo: "Tu usuario no tiene acceso. Habla con el administrador."; claves en .env; forma de crear el primer ADMIN. Necesita del usuario: proyecto de Firebase con Authentication activado y sus claves. Listo cuando: el ADMIN entra y la sesión sigue al recargar.

Tarea 5 · Permisos por rol y centro: roles ADMIN, GERENTE, CAJERO, MESERO y COCINA; menú por rol (MESERO → Pedidos; COCINA → Cocina; CAJERO → Pedidos, Caja y Turnos; GERENTE → todo menos usuarios; ADMIN → todo); la API también bloquea por rol; si el usuario tiene varios centros, elige uno al entrar y solo ve ese centro; pantalla de usuarios para el ADMIN (crear también en Firebase, rol, centros, desactivar). Listo cuando: un MESERO solo ve Pedidos y no entra a Caja ni escribiendo la dirección.

R1 · Revisión de Codex (solo Codex): revisión a fondo de las tareas 0 a 5 contra AGENTS.md y docs/especificacion.md.

Tarea 6 · Catálogo (ADMIN y GERENTE): categorías (crear, editar, ordenar, desactivar); productos con SKU, nombre, categoría y precio base, desactivar en vez de borrar; precio y disponibilidad por centro en producto_centro (sin precio propio usa el base); buscador y filtro por categoría. Listo cuando: un producto con precio distinto en otro centro muestra el precio correcto.

Tarea 7 · Turnos de caja (CAJERO y GERENTE): abrir con fondo inicial, uno solo por centro (si ya hay, mostrar quién lo abrió y a qué hora); cerrar con efectivo contado, mostrando lo esperado y la diferencia; fecha de operación con hora de Guatemala; historial de turnos. Listo cuando: no deja abrir dos turnos en el mismo centro.

Tarea 8 ★ · Pedidos (MESERO, CAJERO y GERENTE): tipo de venta (mesa, para llevar, domicilio, app) y mesa o cliente; UUID del pedido y de cada línea generado en la app; folio asignado por la API con siguiente_folio; productos por categoría con cantidad y notas; agregar productos después guardando quién y a qué hora; anular línea con motivo; lista del día con folio, estado, total, hora y buscador; un pedido pagado o anulado no admite productos. Listo cuando: dos pedidos reciben folio 1 y 2 y la línea agregada guarda usuario y hora.

Tarea 9 · Cocina en tiempo real con Socket.IO (COCINA y GERENTE): los pedidos nuevos aparecen sin recargar con folio, tipo, mesa, productos, notas y minutos de espera; lo agregado después se marca "NUEVO"; estados En preparación → Listo → Entregado; caja y mesero ven el cambio al instante; aviso y reconexión automática si se pierde la conexión. Listo cuando: un pedido nuevo aparece en Cocina sin recargar.

Tarea 10 ★ · Caja (CAJERO y GERENTE): buscar por folio o en la lista de pendientes; detalle, total, pagado y saldo; efectivo con vuelto, tarjeta o transferencia; con tarjeta es obligatorio la terminal del POS y el número de autorización; pago dividido; exige turno abierto; bloqueos en español (pedido ya pagado, voucher ya usado, monto mayor al saldo); comprobante con folio, productos, total y forma de pago. Listo cuando: no deja cobrar dos veces ni repetir un voucher.

Tarea 11 · Reportes (GERENTE y ADMIN): ventas por tipo de venta, hora y producto, por centro y rango de fechas; total de pedidos, total vendido, ticket promedio y desglose por forma de pago; historial de un pedido; descarga en CSV. Listo cuando: los totales cuadran con los pedidos cobrados.

Tarea 12 · Pruebas de la Fase 1: pruebas automáticas de folio sin repetir con dos cajas al mismo tiempo, cobro doble, voucher repetido, cobro mayor al saldo, productos en pedido pagado, un turno por centro y permisos por rol y centro; lista de pruebas a mano para el usuario en docs/pruebas-manuales.md. Listo cuando: todas las pruebas pasan.

R2 · Revisión de Codex (solo Codex): revisión a fondo de las tareas 6 a 12, con atención especial a pedidos, caja y cobros.

Tarea 13 ★ · Publicar en Google Cloud: Cloud SQL con PostgreSQL 16 y respaldos automáticos; API con Docker en Cloud Run; app en Firebase Hosting; claves en Secret Manager; GitHub Actions que prueba y publica en la rama main; guía paso a paso para el usuario. Necesita del usuario: aprobar el plan y el costo mensual, facturación activa y cuenta de GitHub. NO crear nada en la nube sin aprobación. Listo cuando: la app pública funciona con un pedido completo.

## FASE 2 · Conciliación y control

Tarea 14 ★ · Cierre del POS y conciliación (GERENTE y ADMIN): subir el archivo de cierre de un día y centro a pos_transaccion, con el original en Cloud Storage; subirlo dos veces no duplica; marcar CONCILIADO, SIN_PEDIDO, DIFERENCIA_MONTO o DUPLICADO; reporte de diferencias (POS sin pedido, sistema sin POS, montos distintos); nota del gerente por diferencia (si requiere un campo nuevo en la base, preguntar al usuario). Necesita del usuario: un archivo de ejemplo del POS en docs/ejemplos. Listo cuando: lo cobrado en Caja sale CONCILIADO y subir el archivo dos veces no duplica.

Tarea 15 · Anulaciones con autorización: siempre con motivo; si anula un CAJERO o MESERO, un GERENTE autoriza en ese momento; guardar quién pidió, quién autorizó, hora y motivo; un pedido pagado se anula solo anulando antes sus pagos; reporte de anulaciones por usuario. Cambios a la base: preguntar al usuario. Listo cuando: un cajero no puede anular sin el gerente.

Tarea 16 · Auditoría y seguridad por centro: la API hace SET LOCAL app.usuario_id en cada operación; pantalla de auditoría por pedido, usuario o fecha con el antes y el después explicado en palabras; activar Row Level Security por centro de venta. Listo cuando: la auditoría muestra quién creó, agregó y cobró un pedido.

R3 · Revisión de Codex (solo Codex): revisión a fondo de las tareas 13 a 16, con atención especial a conciliación, anulaciones y seguridad por centro.

## FASE 3 · Modo sin internet y alta disponibilidad

Tarea 17 ★ · Sin internet, parte 1: Service Worker (Workbox) para que la app abra sin conexión; menú, precios y usuario guardados en IndexedDB (Dexie.js); registro de dispositivos (CAJA1, TAB01) en la tabla dispositivo; aviso "Sin internet" y "Conectado"; la sesión abierta sigue funcionando sin internet. Listo cuando: con el wifi apagado la app abre y muestra el menú con precios.

Tarea 18 ★ · Sin internet, parte 2: modo mostrador (la caja toma y cobra); cola en la tablet en el orden en que se hizo, con folio provisional (CAJA1-0001) y hora real del dispositivo; envío automático en orden con sync_pedido y sync_pago; los reenvíos no duplican; folio definitivo y búsqueda por los dos folios; probar los 8 casos sin internet de la especificación. Listo cuando: los pedidos hechos sin internet llegan sin duplicados al volver la conexión.

Tarea 19 · Sin internet, parte 3: imprimir comanda y comprobante en impresora térmica USB o Bluetooth, con o sin internet; folio provisional bien visible; guía de impresoras compatibles. Necesita del usuario: la impresora. Listo cuando: sin internet sale la comanda con folio provisional.

Tarea 20 · Sin internet, parte 4 (GERENTE): bandeja de conflictos con dispositivo, hora, tipo, monto, voucher y motivo en español; marcar Resuelto o Descartado con nota; desactivar un dispositivo perdido; aviso si un dispositivo no sincroniza en más de 15 minutos; captura del talonario de emergencia marcada como MANUAL. Listo cuando: un voucher repetido sin internet llega a la bandeja con su motivo.

Tarea 21 ★ · Alta disponibilidad y monitoreo: HA y PITR en Cloud SQL; Cloud Run con al menos una instancia activa; Sentry en app y API; alertas por correo de Cloud Monitoring; guía para dar de alta un segundo centro de venta. Necesita del usuario: aprobar el plan y el aumento de costo. Listo cuando: la base dice Alta disponibilidad y llega un correo de prueba de las alertas.

R4 · Validación final (solo Codex): todo el sistema contra docs/especificacion.md (5 capas contra cobros duplicados, reglas sin internet, permisos, claves y mensajes en español), corriendo todas las pruebas; resultado en REVISION-FINAL.md.

=== FIN DEL PLAN ===
