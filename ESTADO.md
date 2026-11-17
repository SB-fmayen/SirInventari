# ESTADO del modo relevo

Libreta compartida entre Claude Code y Codex. Se actualiza al terminar cada tarea y a mitad de las tareas grandes.

## Última actualización

2026-11-16 (hora de Guatemala) · Codex

## Reportes · Simulador de comisiones Cubo · En curso

- Solicitud expresa del usuario: levantar el proyecto, leer los cambios de Claude del 15/11 y enfocarse en Reportes. Se intercala esta ampliación de Tarea 11; R3 y las revisiones pendientes conservan su lugar para otro turno.
- Leídos estado, plan y commits de Claude: catálogo con fotos, Ventas, anulaciones, auditoría/RLS, modo sin internet y últimos ajustes de diseño/pruebas. Sin correcciones ajenas al alcance actual.
- Base local iniciada con el script existente; API y Vite levantados con acceso de red para Firebase. Salud API/base correcta (fecha 2026-11-16, America/Guatemala); app HTTP 200. Sin modificar esquema ni ventas comerciales.
- API lista: `GET /reportes/comisiones`, solo ADMIN/GERENTE y centro actual. Usa fecha de operación del **pago**, tarjeta APLICADA (incluidos abonos y pedidos en papelera), filtro opcional de terminal y selección de pedidos. Efectivo, transferencias y anulados se excluyen.
- Comisión 5.50% sobre cobrado diario, IVA 12% sobre comisión, redondeo decimal a centavos por día; el rango suma días. Ejemplo Q1,000 − Q55 − Q6.60 = Q938.40. Es simulación con la tarifa del usuario, no conciliación bancaria.
- Bloque API verificado: 4 pruebas unitarias nuevas + 9 de integración (5 nuevas y 4 de reportes previas), build y lint API correctos. Integración usa bases temporales, sin tocar datos comerciales. Continúa la verificación de pantalla, selección y CSV.
- Navegador interno abre la app pero pide iniciar sesión: aún no se afirma validación visual de Reportes con cuenta real.

## Sesión Claude 2026-11-15 · Fotos, Ventas sencilla y Tarea 15

- **Fotos del catálogo:** 30 imágenes del usuario comprimidas a WebP 480×480 (~25 KB) en `docs/datos/fotos-iguana/`; 152 productos del menú La Iguana con foto de su sección (Tradicionales/Especialidades/Premium) o categoría. Respaldo previo `logs/respaldo-productos-antes-fotos.sql`. Scripts `apps/web/scripts/comprimir-fotos-iguana.mjs` y `apps/api/scripts/cargar-fotos-iguana.mjs` (simula con ROLLBACK; no pisa fotos puestas a mano). Originales (68 MB) ignorados en Git.
- **Corrección mínima:** 2 pruebas web seguían usando el campo Mesa retirado por Codex; ahora usan el nombre del cliente.
- **Ventas más sencilla (pedido del usuario):** pasos numerados, tipo de venta con botones grandes, datos del cliente plegables (se abren solos en domicilio), tocar un producto repetido suma cantidad, insignia «× n» en la tarjeta, − / + grandes, notas rápidas de un toque, total destacado, barra «Ver pedido» en móvil, estados de pedidos en color. Detalle en `docs/flujo-mostrador.md`.
- **Tarea 15 · Terminada sin cambiar la base** (el usuario NO autorizó agregar ANULAR_PEDIDO a `solicitud_autorizacion`): la API rechaza con 403 en español que CAJERO o MESERO anulen productos o pedidos directamente. Quitar un producto pasa por la solicitud ANULAR_LINEA existente que aprueba un gerente; anular un pedido completo solo lo hace ADMIN/GERENTE. Pedido pagado sigue exigiendo anular antes los pagos. Nuevo `GET /reportes/anulaciones` y sección «Anulaciones por usuario» en Reportes con CSV (quién pidió, quién autorizó, motivo y hora).
- Verificado: 85 web + 95 integración + 14 unitarias API = 194 correctas. Builds y lint correctos (solo avisos previos). API reiniciada con el compilado nuevo.
- **Tarea 16 · Terminada** (Row Level Security autorizado por el usuario el 2026-11-15):
  - Hallazgo: la API se conecta como `ventas_app`, superusuario dueño de las tablas, que ignora RLS. Solución sin contraseñas nuevas: `db/08_seguridad_centros.sql` (también anexado a `01_esquema_v0.3.sql`) crea el rol NOLOGIN `ventas_api`, sus permisos y políticas por `centros_permitidos()` en pedido, pedido_detalle, pago, turno_caja, movimiento_caja, solicitud_autorizacion, pos_transaccion, dispositivo y sync_conflicto. Aplicado a la base local con respaldo previo `logs/respaldo-antes-08-seguridad.dump`.
  - API: `ContextoBdInterceptor` (global, después de la guardia) guarda usuario y centros en AsyncLocalStorage; `PoolConContexto` (pool de pg) hace en cada conexión `SET ROLE ventas_api` + `app.usuario_id` + `app.centros`. Fuera de peticiones (scripts, tiempo real, arranque) hace `RESET ROLE`. Así la auditoría registra el usuario en todos los cambios.
  - Auditoría: `GET /auditoria` (folio, fecha, usuario o pedido) y `GET /auditoria/usuarios`, solo ADMIN/GERENTE, con explicación en palabras («Creó el pedido…», «Agregó 2 × …», «Cobró Q … con Efectivo», «Quitó … Motivo…»). Pantalla nueva **Auditoría** en el menú.
  - Verificado: 99 integración (incluye `seguridad-centros.e2e-spec.ts`: la base oculta y no deja cambiar pedidos de otro centro; sin centros no ve nada; auditoría muestra quién creó, agregó y cobró) + 14 unitarias + 86 web.
  - **Para R3 (Codex):** Prisma agrupa en el mismo instante las consultas `findUnique` de forma idéntica; si dos peticiones de centros distintos coinciden en ese instante, el lote corre con el contexto de la primera. La API sigue filtrando por centro en cada consulta (protección principal); el efecto posible es un 404 falso, no una fuga. Revisar si conviene cambiar esos `findUnique` críticos a `findFirst`. El canal de tiempo real (Socket.IO) consulta sin rol limitado, como antes. En Cloud SQL el usuario de la API no será superusuario: el script ya hace `GRANT ventas_api TO CURRENT_USER`.
- **R3 pendiente para Codex.** El usuario pidió expresamente en esta sesión que Claude siguiera con las Tareas 17, 18 y 19, así que se continuó sin esperar R3. Codex debe hacer R3 (Tareas 13 a 16) cuando le toque.
- **Tarea 17 · Terminada:**
  - Dexie 4.4.7 (y fake-indexeddb 6.2.6 solo para pruebas). `apps/web/src/lib/sinConexion.ts`: base local `sirinventari` con `datos` (copias) y `cola` (para la Tarea 18).
  - `SesionProvider`: guarda la última respuesta de `/sesion` por usuario de Firebase. Sin internet (error de red), la sesión abierta sigue con esa copia (`sinConexion: true`) y vuelve a confirmar el acceso al regresar la conexión (evento online y cada 30 s). Si Firebase no puede renovar el token sin red, se sigue sin token.
  - El `api()` de la sesión guarda y, sin red, devuelve las copias de `/pedidos/catalogo`, `/pedidos/tipos`, `/caja/metodos` y `/dispositivos` del centro. La lista `/pedidos` sin red queda vacía.
  - Dispositivos: `GET/POST /dispositivos` (registrar solo ADMIN/GERENTE, código único de 2 a 10 caracteres). En Inicio, «Este dispositivo» permite elegir o registrar CAJA1, TAB01…; queda guardado en el equipo por centro.
  - Indicador: «Conectado» / «Sin internet».
  - El Service Worker (Workbox) ya guardaba la app; ahora, con la app compilada, abre sin red. En desarrollo (`vite`) el Service Worker se retira a propósito: la prueba real sin red se hace con `npm run build` y `npm run preview`.
  - Verificado: 88 web (incluye abrir sin red con menú y precios) + 100 integración + 14 unitarias.
- **Corrección importante (hallada en la Tarea 18):** la conexión de Prisma usaba `timezone=America/Guatemala`, pero el adaptador `@prisma/adapter-pg` envía las fechas en UTC sin zona: todo lo que la API guardaba (`creado_en`, `anulado_en`, `abierto_en`, `cerrado_en`…) quedaba **6 h adelantado** en la base, y se leía 6 h atrasado. La API lo compensaba, pero la base comparaba mal esas horas con las suyas (`now()`): por ejemplo, todo cobro sin internet salía como «cobro atrasado». Ahora la conexión usa `timezone=UTC`. La base calcula siempre la fecha de operación con `fecha_guatemala()` y `AT TIME ZONE 'America/Guatemala'` (revisado: no usa `CURRENT_DATE` ni conversiones que dependan de la sesión). **Datos locales anteriores:** las horas que guardó la API antes de este cambio siguen 6 h adelantadas en la base de desarrollo y ahora se verán corridas. No se tocaron: son datos de prueba. Si se quieren corregir hace falta permiso del usuario.
- **Tarea 18 · Terminada:**
  - API `POST /sincronizacion` (ADMIN/GERENTE/CAJERO/MESERO): recibe la cola del equipo en orden y llama a `sync_pedido` / `sync_pago`. Usuario y precio los pone la API, no el equipo. Valida que el equipo sea del centro y que la hora no esté adelantada. Devuelve APLICADO / YA_EXISTIA / CONFLICTO / YA_EN_CONFLICTO / CONFLICTO_PARCIAL con el folio definitivo y el motivo. Avisa a Cocina por tiempo real al aplicar.
  - `GET /sincronizacion/conflictos` y `POST /sincronizacion/conflictos/:id` (ADMIN/GERENTE): bandeja con motivo, resolución con nota obligatoria y alerta de equipos sin sincronizar hace más de 15 min.
  - App: `lib/cola.ts` (cola Dexie en orden, folio provisional por equipo `CAJA1-0001` con contador que no se repite, envío por lotes, reintento seguro) y `useColaSinInternet` (envío automático cada 20 s y con el evento online). Ventas: si guardar falla por red, el pedido (o los productos agregados) queda en la cola con el mismo UUID. Así, si la respuesta se perdió pero el pedido sí llegó, la nube responde YA_EXISTIA. Incluye cobro sin internet (modo mostrador, efectivo con vuelto o tarjeta con terminal y autorización), lista «Ventas sin internet en este equipo» con estado y folio definitivo, y búsqueda por folio provisional. Bandeja de conflictos en Inicio.
  - Verificado: los 8 casos de la especificación (`test/sincronizacion.e2e-spec.ts`): reenviar pedido y pago sin duplicar ni gastar folio, producto agregado a pedido cobrado, voucher repetido, pago de pedido que no llegó, tablet desactivada, pedido sin folio provisional y reenvío de conflicto. Además la hora real del equipo y la bandeja. Web: `sin-internet.test.tsx`.
- **Tarea 19 · Hecha en código; falta la prueba con impresora real:** `componentes/Comanda.tsx`: comanda (folio provisional grande) y comprobante sin internet para papel de 58/80 mm con la impresión del navegador (USB, Bluetooth o red, sin internet). Botón «Imprimir comanda» también en el detalle de cada pedido. Guía `docs/impresoras.md`. La prueba automática comprueba que se llama a imprimir y que la hoja trae FOLIO PROVISIONAL CAJA1-0001. **Necesita del usuario:** la impresora térmica para confirmar el «Listo cuando».
- Verificado al cierre: 91 web + 107 integración + 14 unitarias = 212 correctas; builds y lint correctos (solo avisos previos).
- **Siguiente:** R3 (revisión de Codex de las Tareas 13 a 16) y revisión de las Tareas 17 a 19. Pendientes de usuario: impresora (T19), plan y costo de nube (T13), archivo del POS (T14).

## Ventas como terminal de mostrador · 2026-11-15

- El usuario pidió una pantalla más interactiva: menú a la izquierda y pedido a la derecha.
- Hecho en `apps/web/src/paginas/Pedidos.tsx` e `index.css` (solo diseño, sin cambios en API ni base): categorías en columna, rejilla de productos con contador, pedido fijo a la derecha con tipo de venta, cliente, líneas (− / +, nota plegable), total y botones siempre visibles. El pedido se desplaza solo al producto recién tocado. En teléfono se apila y queda la barra «Ver pedido».
- Se quitó la franja de pasos numerados. 91 pruebas web pasan; revisado en el navegador en una pantalla de 1568×745.
- **Siguiente:** sin cambios (R3 de Codex).

## Cierre solicitado · Retomar en la siguiente sesión

- Apagados API compilada (PID 5240), Vite de SirInventari (38560), contenedor existente sirinventari-db y Docker Desktop. Comprobado: procesos detenidos y puertos 3000, 5173, 5555 y 5432 cerrados. No se borraron contenedores, volúmenes, ventas, clientes, catálogo, usuarios, borradores ni respaldos; no se tocó PostgreSQL nativo ajeno en 5433.
- Trabajo de clientes/papelera y Comer en mesa sin numeración guardado hasta 5f7000a. Última verificación general: 190 pruebas correctas; ajuste posterior de mesa comprobado con 14 web y 6 de integración, builds correctos. Solo este cierre cambia ESTADO.md. Se conservan REVISION.md y PDF de relevo sin seguimiento.
- Para retomar: iniciar base con scripts/iniciar-base-local.ps1, comprobar que 5173 esté libre y levantar Vite; iniciar API compilada con acceso de red fuera del entorno restringido para que Firebase pueda validar certificados. Revisar logs y /salud. No volver a aplicar SQL 07: ya está aplicado y hay respaldo privado previo en logs/.
- Siguiente: probar con el usuario Clientes, datos de contacto/buscador de Ventas, cambios por campo, Papelera y Comer en mesa sin número. Guías docs/clientes-y-papelera.md y docs/flujo-mostrador.md. Impresión física pendiente; despliegue continúa pospuesto. El usuario confirmó «listo» tras los ajustes; no se afirma validación visual automatizada ni impresión real.

## Comer en mesa sin numeración · 2026-11-08

- El usuario aclara que no hay mesas numeradas. Quitado el campo Mesa de pedidos nuevos y la validación obligatoria de referencia en API. Se mantiene Comer en mesa y los datos opcionales del cliente; sin nombre se usa Cliente de mostrador. Las referencias históricas se conservan y los borradores antiguos se envían sin numeración al crear pedidos nuevos.
- Verificado: 14 pruebas de Mostrador y 6 de integración de Pedidos correctas (incluye creación/reintento MESA sin referencia). Compilaciones web/API correctas, con aviso de tamaño web previo. Sin cambios de esquema ni datos comerciales. API reiniciada PID 5240, logs privados api-sin-numero-mesa*.log; comprobación de salud al cerrar.
- Archivos: apps/web/src/paginas/Pedidos.tsx, apps/web/src/pruebas/mostrador.test.tsx, apps/api/src/pedidos/pedidos.service.ts, apps/api/test/pedidos.e2e-spec.ts, docs/flujo-mostrador.md y ESTADO.md.

## Comer en mesa habilitado · 2026-11-08

- Por solicitud del usuario, Ventas muestra Comer en mesa en el selector de tipos. Reutiliza el tipo MESA existente (id 1, Consumo en mesa), comprobado mediante consulta de solo lectura. Mesa es obligatoria; nombre/teléfono/dirección y productos se conservan al cambiar de tipo. Para llevar sigue siendo la opción inicial.
- Verificado: 14 pruebas de Mostrador correctas, incluida selección de mesa y envío de sus datos sin perder productos/contacto. Build web correcto con aviso de tamaño previo. Sin cambios en API, esquema, tipos registrados ni pedidos comerciales. Vista real pendiente del usuario.
- Archivos: apps/web/src/paginas/Pedidos.tsx, apps/web/src/pruebas/mostrador.test.tsx, docs/flujo-mostrador.md y ESTADO.md.

## Clientes y papelera · Implementación local terminada · 2026-11-08

- Terminadas pantallas Clientes y Papelera, datos de contacto/búsqueda junto al teléfono en Ventas, vínculo y actualización explícita de ficha, recibo con contacto, búsqueda de pedidos por fecha y teléfono, y marca En papelera en Reportes/CSV. Clientes permite agregar/editar/detalles y retirar; los detalles e historiales abren ventanas flotantes con protección de cambios. ADMIN/GERENTE eliminan/restauran; CAJERO consulta/edita clientes sin eliminar ni leer sus cambios. MESERO busca/registra desde Ventas sin historial comercial; COCINA no accede. Las restricciones individuales se verifican también en operaciones cruzadas de API.
- Papelera con filtros por tipo, texto (nombre/teléfono/folio/motivo/responsable), fecha del pedido o del retiro del cliente en hora Guatemala, detalle completo y restauración. Listas e historiales paginados de 50 en 50. No hay vaciado permanente, borrado de cobros ni importación automática de clientes por nombres antiguos.
- Validación final: 83 pruebas web + 93 de integración + 14 unitarias API = 190 correctas. Tras completar filtros de motivo/autor/fecha en papelera, las 6 pruebas de integración de clientes y 5 web de clientes volvieron a pasar. Build/lint de API y web correctos; solo persisten 5 avisos web y aviso de tamaño (paquete principal ~652 kB), además del aviso previo de pg en integración. No se modificaron dependencias.
- API reiniciada fuera del entorno restringido para conservar conexión con Firebase, PID 22840, logs privados `logs/api-clientes*.log`, sin errores de arranque. Nuevos controladores registrados; `/salud` confirma API/base correctas, fecha 2026-11-08 y America/Guatemala. App HTTP 200 en http://localhost:5173. Base comercial conserva 3 usuarios, 154 productos y 5 pedidos; 0 clientes nuevos y 0 pedidos retirados. Permisos de tablas nuevas comprobados. No se generaron ventas de prueba en desarrollo.
- Pendiente únicamente validación visual/operativa con la sesión real del usuario e impresión física; el acceso de navegador había resultado indisponible. No se afirma revisión visual ni login real verificados. Despliegue sigue pospuesto. Guía de uso, alcance y archivos en docs/clientes-y-papelera.md. Bloque API inicial guardado en 6d80a49; cierre de pantallas y comprobación en el siguiente commit.

- Usuario aprobó expresamente todo el alcance, incluidos cambios SQL. Respaldo privado `logs/respaldo-clientes-*.dump` creado y comprobado con pg_restore antes de aplicar SQL 07. Se conservan 3 usuarios, 154 productos y 5 pedidos comerciales. Nuevas tablas cliente/cliente_cambio, copia histórica de contacto en pedido y marcas reversibles de papelera; fuente SQL y Prisma actualizados.
- API implementada: CRUD de clientes con UUID, teléfono normalizado único por centro, auditoría por campo mediante trigger, control de versiones y creación/vínculo atómico desde pedido. Historial comercial y de cambios paginados; búsquedas por nombre/teléfono. Papelera lista/retira/restaura clientes y pedidos con motivo, rol ADMIN/GERENTE y restricciones individuales. No se ocultan pendientes de cobro ni pedidos sin entregar; se conservan pagos/reportes y se marca el retiro en reportes.
- Primer bloque comprobado: 6 pruebas nuevas de integración correctas (duplicados concurrentes, reintentos, permisos/centros, historial inmutable, copia histórica, rollback y retiro/restauración sin alterar ventas); ejecución general previa de integración 93 correctas, 14 unitarias API, build y lint API correctos. La marca adicional en reportes y validación cruzada de permisos se verificaron después con las 6 pruebas nuevas. Continúa la implementación/prueba de pantallas. API local aún requiere reinicio final para servir el compilado nuevo.
- Sin despliegue. Pruebas en bases temporales; no se crearon clientes ni ventas de prueba en la base comercial. Guía y aprobación en docs/clientes-y-papelera.md. Los archivos locales REVISION.md y PDF de relevo se conservan sin seguimiento.

## Solicitud de clientes y papelera · Propuesta aprobada · 2026-11-08

- Usuario solicita clientes (nombre/dirección/teléfono), búsqueda junto al teléfono en Ventas, historial de pedidos/detalles en ventana flotante, edición/eliminación, historial de cambios por campo con usuario/fecha y papelera de clientes/pedidos; eliminar solo ADMIN/GERENTE.
- Revisados esquema, flujo y últimos commits. No existe tabla de clientes ni datos de teléfono/dirección del pedido. Propuesta concreta en docs/clientes-y-papelera.md: cliente por centro, copia histórica de entrega en pedido, auditoría por campos, retiro reversible con motivo y restauración sin alterar pagos/reportes. Papelera inicial para clientes/pedidos; sin vaciado permanente. Los pendientes deben anularse antes de retirar; los cobrados deben estar entregados.
- La propuesta inicial se preparó sin modificar SQL por AGENTS.md regla 3. Después el usuario aprobó expresamente todo («así merito procede con todo»); implementación y comprobaciones terminadas en el bloque superior. Acceso ADMIN real de la sesión anterior aún no confirmado.
- Archivos: docs/clientes-y-papelera.md, docs/plan.md y ESTADO.md. Verificación documental con git diff --check; no corresponde repetir pruebas de código.

## Diagnóstico de acceso ADMIN · 2026-11-08

- Usuario reporta 401. Lectura de base confirma ADMIN id 18 activo y con UID; proyectos Firebase web/API coinciden. No se tocaron credenciales, permisos ni datos.
- Detectado bloqueo de red del entorno restringido: consulta Node a certificados públicos de Firebase falla EACCES y la misma consulta fuera del entorno devuelve HTTP 200. API se había iniciado dentro de ese entorno. Reiniciada fuera con autorización del usuario, PID 25348; salud API/base correcta y log de error vacío. Stop-Process falló; se verificó nuevamente el PID/comando original y se detuvo con Process.Kill antes del arranque final. Intento intermedio dio EADDRINUSE sin afectar datos.
- Pendiente reintento real del usuario para confirmar resolución del 401; aún falta URL de solicitud rechazada. No se afirma login real validado. Logs actuales: logs/api-acceso-red*.log. Solo cambia ESTADO.md; no se requieren pruebas de código.

## Configuración general del recibo · 2026-11-08

- Selector en el comprobante: Automático, rollo 58/80 mm, Carta y A4. Vista previa e impresión comparten ancho; preferencia local por navegador con alternativa temporal si no permite almacenamiento. Se conserva diálogo normal e impresión opcional. Impresora/papel físico se seleccionan en el controlador; no se garantiza compatibilidad física sin probar el equipo.
- Verificado: 75 pruebas web correctas, build y lint correctos con 5 avisos previos y aviso de tamaño. Pendiente validación visual e impresión física del usuario. Sin cambios API/base ni datos comerciales.
- Archivos: apps/web/src/componentes/TicketVenta.tsx, apps/web/src/index.css, docs/flujo-mostrador.md y ESTADO.md.

## Retoma local · 2026-11-08

- A solicitud del usuario: revisados estado, plan y últimos commits; resumen del trabajo del 7 de noviembre preparado.
- Iniciados Docker Desktop y contenedor existente `sirinventari-db` (sano), API compilada (PID 33456) y Vite (PID 38560), en segundo plano. App disponible en http://localhost:5173 y API en http://localhost:3000.
- Verificado: `/salud` responde API/base correctas, fecha 2026-11-08 y America/Guatemala; web HTTP 200 con título SirInventari; logs de error de arranque vacíos. Comprobación de base de solo lectura: 3 usuarios, 154 productos y 5 pedidos. No se modificaron datos comerciales ni código.
- Pendiente validar con el usuario Ventas, Catálogo y recibo físico de 80 mm. Despliegue sigue pospuesto. No se repitieron pruebas automáticas por tratarse solo de un arranque. Logs privados en `logs/*-retoma-20261108-124738*.log`.
- Archivo cambiado: `ESTADO.md`. Se conservan los dos archivos locales sin seguimiento.
## Cierre solicitado · Retomar mañana

- Apagados API compilada (19144), Vite de SirInventari (28924) y su lanzador npm (25836), contenedor `sirinventari-db` y Docker Desktop. Los tres procesos ya no están activos; puertos 3000, 5432 y 5555 cerrados. Se conservan volumen, ventas, catálogo, usuarios, borradores y respaldos.
- El puerto 5173 conserva una vista previa ajena al proyecto (PID 20688, `vite preview`); comprobación HTTP identifica su título como «Cuentas por pagar». No se detuvo esa aplicación. No se tocó PostgreSQL nativo ajeno en 5433.
- Todo el trabajo del proyecto estaba guardado en `d2871dc` y commits anteriores. Este cierre cambia solo `ESTADO.md`; se conservan sin seguimiento `REVISION.md` y `Modo relevo Claude Code y Codex.pdf`.
- Para retomar: iniciar la base con `scripts/iniciar-base-local.ps1`, levantar API y app; comprobar primero si 5173 sigue ocupado por la aplicación ajena antes de iniciar Vite (usa strictPort). Después validar el Catálogo reorganizado con el usuario, guía `docs/catalogo.md`, y continuar los demás módulos. Recibo de 80 mm con nombre Shukos y pizza la iguana pendiente de validación física. Despliegue continúa pospuesto.

## Catálogo ordenado y edición visible

- A solicitud del usuario: Productos y Categorías en secciones independientes, tabla con precio de venta destacado, filtros y contador, acciones compactas, estados claros y precios por lote al final. Los botones del catálogo dicen solo Eliminar; la confirmación conserva el nombre y el bloqueo de historial. Usuarios conserva su etiqueta anterior.
- Añadidos Desactivar/Activar para productos y categorías. Confirmación explica el alcance global; Agotado/Disponible sigue afectando solo al centro. Se conservan ADMIN/GERENTE para editar y solo ADMIN para eliminar; no se amplían permisos.
- Detectados problemas de flujo: formularios de edición aparecían arriba de la lista y podían quedar fuera de vista; guardar datos generales o precio del centro cerraba todo y descartaba cambios del otro formulario. Ahora se abre un diálogo centrado con desplazamiento propio, errores visibles, campos bloqueados al guardar y confirmación de salida. Guardar una sección conserva el editor y cambios pendientes de la otra; cada sección limpia solo su propio estado de cambios. Foto/variantes/complementos quedan en un desplegable opcional.
- Validación: 75 pruebas web correctas, incluidas 6 nuevas de Catálogo; 5 pruebas de integración de Catálogo correctas en base aislada, con nueva prueba de persistencia real de nombre/SKU/categoría/precio y edición de categoría. Build web y lint web/API correctos; se conservan 5 avisos web y tamaño de paquete. Una ejecución paralela tuvo timeout de 5 s en una prueba previa de Mostrador; la suite completa pasó con `--maxWorkers=1`, sin cambiar la prueba ni ampliar el límite.
- API/base sanas y Vite entrega el Catálogo actualizado (HTTP 200). Sin cambios en API de negocio, esquema, datos comerciales ni despliegue. Pendiente validación visual/operativa del usuario en su sesión real. Guía en `docs/catalogo.md`.
- Archivos: `apps/web/src/paginas/Catalogo.tsx`, `componentes/AdministracionRegistros.tsx`, `index.css`, nueva `pruebas/catalogo.test.tsx`, `apps/api/test/catalogo.e2e-spec.ts`, nuevo `docs/catalogo.md` y `ESTADO.md`.

## Ticket corregido a recibo compacto

- Nombre comercial añadido por solicitud del usuario: **Shukos y pizza la iguana** en el encabezado, conservando el centro de venta debajo. Aplica a vista previa e impresión. Compilación web correcta. Archivos de este ajuste: `apps/web/src/componentes/TicketVenta.tsx` y `ESTADO.md`.
- El usuario aclaró que quiere formato tipo recibo. Reemplazado el diseño de hoja completa por recibo de 80 mm de ancho, tanto en pantalla como al imprimir. Encabezado centrado, datos en una columna, productos con precio unitario debajo e importe al lado; tipografía y espacios compactos. Se conserva la impresión opcional y el contenido de los cobros.
- Se retiró la indicación Carta/A4 de la pantalla. La impresión conserva ancho de recibo; papel físico y escala dependen del diálogo/controlador de la impresora. No se configura ni se cambia la impresora del usuario.
- Verificado: build web y 69 pruebas web correctas. Sin cambios API/base ni cobros de prueba. Falta validación visual e impresión física con el usuario; no se afirma haberlas realizado.
- Archivos: `apps/web/src/componentes/TicketVenta.tsx`, `apps/web/src/index.css`, `apps/web/src/paginas/Caja.tsx`, `docs/flujo-mostrador.md` y `ESTADO.md`.

## Corrección de revisión y ticket láser

- Implementado lo pedido: quitar productos también en la revisión integrada de Caja y anular pedido completo con motivo. No borra ventas ni líneas; recalcula al quitar y conserva importes originales al anular. Endpoint `POST /pedidos/:id/anulacion` con bloqueo del pedido, restricción por centro/rol/permiso anular, rechazo de pagos aplicados y auditoría de motivo/autor. Reintentos seguros; no hay cambios de esquema, triggers ni funciones.
- Cortesía explicada en pantalla como pedido gratis autorizado por gerente/ADMIN, distinta de anulación. Autorización general de todas las anulaciones de Tarea 15 sigue pendiente; la cancelación sin pagos usa los permisos actuales de Pedidos/anular.
- Ticket nuevo al completar el pago: diseño en blanco/negro para láser Carta/A4, productos y pagos activos, precios/importes, descuentos, folio, centro, fecha/hora Guatemala, total/saldo y referencias POS. Imprimir abre diálogo del navegador únicamente al pulsarlo; Continuar sin imprimir conserva pago y sigue el flujo. Historial permite reimpresión; no se inventa efectivo recibido/vuelto histórico. La impresión térmica/sin internet sigue pendiente de Tarea 19.
- Verificación: 69 web + 14 unitarias API + 86 integración = 169 pruebas correctas; compilaciones y lint correctos con avisos anteriores. Nuevas pruebas cubren motivos/auditoría, pagos parciales/completos que bloquean anulación, centro/permisos, carrera cobro-anulación, quitar/recalcular, ticket opcional y continuar sin duplicar el pago. Integración en bases aisladas.
- API en modo watch quedó sin poder reiniciar durante el build de comprobación. Se detuvo solo su watcher verificado (24348) y se inició el compilado actual, PID 19144, con logs en `logs/api-ticket*.log`. `/salud` confirma API/base correctas; Vite sirve el ticket actualizado. API/app quedan disponibles. Sin ventas de prueba en desarrollo y sin despliegue.
- Pendiente validar visualmente y físicamente el ticket con el usuario: no se afirma impresión real ni revisión visual completada. Guía actualizada en `docs/flujo-mostrador.md`.
- Archivos: `apps/api/src/pedidos/pedidos.controller.ts`, `pedidos.service.ts`, `apps/api/test/caja.e2e-spec.ts`; `apps/web/src/paginas/Pedidos.tsx`, `Caja.tsx`, nuevo `componentes/TicketVenta.tsx`, `index.css`, `pruebas/mostrador.test.tsx`; `docs/flujo-mostrador.md` y `ESTADO.md`.

## Flujo de mostrador · Ventas unifica Pedidos y Caja

- A solicitud expresa del usuario, operación enfocada en una PC de mostrador. Menú único Ventas, con categorías visibles, búsqueda por nombre/código sin tildes, tamaños/precios explícitos y resumen lateral con importes, cantidades y notas. Se retiran los filtros superpuestos de familias/extras y la vista de mesas de la operación principal.
- Nuevo pedido inicia Para llevar; Mesa se conserva para históricos/borradores y compatibilidad con catálogos antiguos. Nombre opcional con referencia Cliente de mostrador. Guardar y cobrar abre directamente el cobro del pedido confirmado dentro de Ventas; se conserva guardar pendiente, comprobante y siguiente venta. Pendientes/historial están en la misma pantalla; `/caja` es un acceso compatible, sin entrada separada en el menú.
- Conservados roles, restricciones individuales y permisos de API. MESERO no accede a cobros. Usuario con acceso solo a Caja conserva Ventas sin consultar Pedidos. Resultado incierto bloquea cambiar de pedido y reintenta el mismo UUID; errores de guardado conservan borrador y no abren cobros.
- Verificado: 67 pruebas web correctas (8 nuevas del flujo), compilación/lint correctos, 5 avisos web previos y tamaño de paquete. No se repitieron las pruebas API ya verificadas en esta fecha: API/SQL no cambian. API/base sanas en `/salud`; Vite entrega HTTP 200 del módulo actualizado. No se crearon ventas de prueba en la base local.
- Inspección visual pendiente: control de Chrome detenido por no poder verificar la URL con suficiente confianza; no se afirma revisión visual completada. API/app siguen iniciadas para probar con el usuario. Despliegue continúa pospuesto.
- Archivos: `apps/web/src/App.tsx`, `secciones.ts`, `index.css`, `paginas/Pedidos.tsx`, `paginas/Caja.tsx`, `paginas/Inicio.tsx`, `componentes/PermisosRoles.tsx`, `pruebas/app.test.tsx`, nueva `pruebas/mostrador.test.tsx`; `docs/flujo-mostrador.md`, `docs/roles-y-accesos.md`, `docs/plan.md` y `ESTADO.md`.
- Siguiente: validar Ventas con el usuario siguiendo `docs/flujo-mostrador.md`, corregir sus observaciones y continuar con los demás módulos. Este cambio no cierra R2 ni las fases futuras.

## Retoma y validación del estado · Despliegue pospuesto

- Arranque funcional solicitado el 2026-11-07: base, API en http://localhost:3000 y app en http://localhost:5173 iniciadas. `/salud` confirma API/base correctas y fecha de Guatemala; app devuelve HTTP 200, sin errores en los logs de arranque. API/app en segundo plano con logs privados en `logs/*-funcional*.log`. Pendiente probar pantallas con la sesión real del usuario; no se declara esa validación hecha. Sin cambios de código ni despliegue.
- El usuario pide validar primero el proyecto; el despliegue queda pospuesto por instrucción expresa. No se crearon servicios ni se habilitó publicación.
- Revisados plan, estado, guías de mejoras/seguridad y últimos commits. Sin cambios de código pendientes; se conservan fuera de Git `REVISION.md` y `Modo relevo Claude Code y Codex.pdf`.
- Verificación actual: 14 pruebas unitarias API, 59 web y 83 de integración correctas (156 en total). Compilación y lint de ambas aplicaciones correctos; persisten 5 avisos web, tamaño del paquete (612 kB) y aviso de consultas concurrentes de pg. No se repitió la auditoría de dependencias: sus cifras anteriores son históricas.
- Iniciados Docker Desktop y la base existente: sana, zona America/Guatemala, 3 usuarios, 154 productos y 3 pedidos. Pruebas de integración en bases aisladas; no se modificaron datos comerciales ni esquema. No se levantaron API ni app en este turno.
- Siguiente: levantar API/app y validar visualmente el flujo Turnos → Pedidos → Cocina → Caja → Reportes, y después Catálogo/Usuarios, siguiendo `docs/mejoras-aprobadas.md` y `docs/pruebas-manuales.md`. Cerrar revisión R2 sobre el código actual y revisar dependencias antes de considerar el piloto aprobado.
- Alcance futuro aún pendiente: conciliación POS (requiere archivo real), completar autorización de anulaciones y auditoría/RLS, ventas sin internet/sincronización, impresión y conflictos; monitoreo/alta disponibilidad requieren su etapa y aprobación de costos. Las mejoras implementadas no sustituyen esas tareas.
- Archivo cambiado en esta retoma: `ESTADO.md`.

## Cierre solicitado por el usuario · Retomar mañana

- Todas las mejoras guardadas en `7aecdc3` y `c930f19`; 156 pruebas automáticas correctas en la última verificación. Guía completa en `docs/mejoras-aprobadas.md`.
- Apagados API (29716), Vite (16448), Prisma Studio (16380), contenedor `sirinventari-db` y Docker Desktop. Comprobado que no hay escucha en 3000, 5173, 5555 ni 5432. No se eliminaron contenedores, volúmenes, datos, borradores locales ni respaldos. La instalación nativa ajena al proyecto en 5433 no se modificó.
- Siguiente: iniciar la base con `scripts/iniciar-base-local.ps1`, levantar API/app y abrir Prisma Studio si el usuario lo necesita; después validar con el usuario cada módulo siguiendo la guía. Falta la revisión visual/manual; no publicar ni dar R2 por cerrada todavía.
- Los archivos locales sin seguimiento `REVISION.md` y `Modo relevo Claude Code y Codex.pdf` se conservaron y no se incluyeron en Git. No había cambios de código sin guardar al cerrar; este cierre solo actualiza `ESTADO.md`.

## Mejoras aprobadas · Implementadas, pendientes de validación con el usuario

- El usuario aprobó todas las propuestas por módulo y autorizó implementarlas. Alcance y decisiones en `docs/mejoras-aprobadas.md`.
- Respaldo privado de la base en `logs/` antes de aplicar `db/06_mejoras_modulos.sql`. SQL fuente y Prisma actualizados: motivos de diferencia/cortesía, fotos y variantes de producto, movimientos de caja, solicitudes de autorización y permisos por usuario. Sin borrar ventas ni crear servicios de pago.
- Primer bloque operativo: protección del último ADMIN con bloqueo ante cambios simultáneos; filtros de usuarios y reintento de Firebase; restricciones de acciones en API dentro del rol/centro; solicitudes y autorización de cortesías, anulación de pagos y correcciones de cocina; eliminación administrativa solo sin historial. Inicio incorpora resumen/solicitudes y accesos rápidos.
- Pedidos incorpora filtros/contadores, mesas abiertas, borrador local recuperable, cantidades +/− y notas frecuentes. Turnos incorpora denominaciones, motivo de diferencia, confirmación de pendientes e ingresos/retiros con UUID y bloqueo. Cocina incorpora sonido opcional, demoras, pantalla completa/filtro y solicitud de corrección; Caja incorpora historial, atajos de efectivo y autorizaciones.
- Segundo bloque terminado: Catálogo con agotados, fotos de hasta 200 KB, variantes/complementos y precios por lote con vista previa/concurrencia; Usuarios con interfaz de eliminación y restricciones individuales; Reportes con fechas rápidas, comparación, excepciones, CSV y consolidado limitado a centros autorizados. Navegación con router de datos de React Router para proteger también Atrás/Adelante, conservando las rutas existentes.
- Verificación final: 83 pruebas de integración + 14 unitarias API + 59 web = 156 correctas. Build/lint correctos; se conservan 5 avisos web previos y aviso de tamaño de paquete. El SQL 06 se simuló nuevamente con ROLLBACK sin errores. Las nuevas pruebas cubren concurrencia, historial, permisos, idempotencia, precios atómicos, fotos y recuperación de borradores.
- API reiniciada con el compilado actual (PID 29716). La base local conserva 3 usuarios, 154 productos y al comprobar había 3 pedidos; las pruebas no crean ventas en desarrollo. No se cambiaron credenciales ni se contrataron servicios.
- Falta validación visual/manual con el usuario. La herramienta de navegador estaba indisponible y el intento de seleccionar Chrome se detuvo al no poder verificar la URL con suficiente confianza. No se declara esa revisión hecha.
- Primer bloque guardado en `7aecdc3`; detalle de las 36 mejoras y sus límites en `docs/mejoras-aprobadas.md`. La conciliación POS, impresión y modo sin internet completo mantienen los requisitos del plan; esta solicitud no los declara terminados.

## PostgreSQL recuperado · Listo para validación con el usuario

- Resuelta la conexión: Docker Desktop estaba detenido e instalado por usuario fuera del PATH (`%LOCALAPPDATA%/Programs/DockerDesktop`). Se inició con su CLI y recuperó automáticamente el contenedor existente `sirinventari-db`, sano en 5432. La instalación nativa de 5433 es otra base: su registro confirma que allí no existe `ventas_app`; no se cambió su contraseña ni su configuración.
- Conexión real a `sistema_ventas` correcta con `.env` existente. Conserva 3 usuarios, 154 productos y 2 pedidos. No se modificaron tablas, funciones, triggers, contraseñas ni datos de negocio.
- Verificación: 72 pruebas de integración, 14 unitarias de API y 54 web correctas (140 en total). Integración en bases aisladas. API local `/salud` devuelve `api: ok`, `baseDatos: ok`, fecha 2026-11-02 y `America/Guatemala`. Web responde HTTP 200 en http://localhost:5173.
- API y web quedan iniciadas en segundo plano (procesos 33892 y 16448 al terminar); logs excluidos de Git en `logs/`. Falta la validación manual del usuario por módulo; no se declara publicación ni login real verificado en este turno.
- Nuevo arranque repetible `scripts/iniciar-base-local.ps1`: encuentra Docker por usuario/general aunque no esté en PATH, inicia el motor si hace falta y levanta `db` con espera de salud. Su modo `-SoloComprobar` no inicia ni crea contenedores. Ambos modos se comprobaron contra la base existente.
- Diagnóstico de solo lectura `apps/api/scripts/comprobar-base-local.mjs`, sin imprimir secretos; guía `docs/base-local.md`. Las advertencias históricas de conexión que figuran abajo quedan resueltas por esta recuperación. Los avisos moderados/bajos de dependencias siguen pendientes de R2.
- Archivos: los dos scripts anteriores, `docs/base-local.md`, `docs/dependencias-seguridad.md` y esta libreta.

## Solicitud del usuario · PostgreSQL, eliminación, roles y diseño

- Diagnóstico: `.env` apunta a localhost:5432, sin servidor escuchando. El servicio PostgreSQL 16 instalado está en 5433 y rechaza tanto las credenciales de `DATABASE_URL` como las variables `POSTGRES_*` (coinciden entre sí). Se pidió al usuario confirmar instalación/cambio de contraseña y actualizar la conexión directamente en `.env`, sin enviar secretos al chat. No se restablecieron contraseñas ni se reemplazaron datos.
- Solicitud de eliminación para ADMIN pendiente de precisar qué registros. Se consultó al usuario; no se implementó borrado permanente ni se cambió la base sin esa definición.
- Renovación implementada: menú lateral en escritorio y horizontal en tablet/móvil, tarjetas de Inicio, estilos comunes de módulos y toma de pedidos con menú/buscador por nombre o SKU y resumen en dos columnas en escritorio. Se conservan las funciones existentes. Tabla de accesos por rol desplegable en Usuarios; detalle en `docs/roles-y-accesos.md`.
- Referencia y revisión visual pendiente en `docs/diseno-modulos.md`: el servicio de acceso al navegador está indisponible. Falta inspección visual con sesión real; no se afirma haberla hecho.
- Verificación de este avance: 54 pruebas web correctas, build y lint correctos (5 avisos de lint y aviso de tamaño previos). Prueba nueva cubre búsqueda por nombre/SKU sin perder cantidades, notas ni total. Integración sigue bloqueada por la conexión de PostgreSQL.
- Archivos: `apps/web/src/App.tsx`, `src/index.css`, `src/paginas/Inicio.tsx`, `Pedidos.tsx`, `Usuarios.tsx`, `src/componentes/PermisosRoles.tsx`, `src/pruebas/app.test.tsx`, las dos guías anteriores y esta libreta.

## Avance R2 · Dependencias antes de publicación (2026-11-02)

- Retirada herramienta sin uso `@nestjs/mau` de API y fijado gRPC 1.13.6 dentro de Firestore en app. Auditorías sin avisos altos/críticos; quedan 7 moderados en API y 14 moderados/bajos en app. Detalles y límites en `docs/dependencias-seguridad.md`.
- Pasan 14 pruebas unitarias API y 53 web; build/lint correctos con avisos web previos. Integración pendiente: no hay PostgreSQL en 5432; el servicio encontrado en 5433 rechaza las credenciales locales. No se cambiaron `.env`, contraseñas ni esquema.
- Conexión e integración resueltas posteriormente: ver «PostgreSQL recuperado» al inicio. Publicación y archivo POS siguen pendientes de los puntos indicados abajo. Seguridad R2 todavía no se declara cerrada.
- Archivos: `apps/api/package.json`, `apps/api/package-lock.json`, `apps/web/package.json`, `apps/web/package-lock.json`, `docs/dependencias-seguridad.md` y esta libreta.

## Tarea 9 · Cocina terminada

- Pantalla real en `/cocina`: columnas Pendientes, En preparación y Listos; entregados del día opcionales; tarjetas con folio, tipo, mesa/cliente, fecha/hora de Guatemala, cantidades, notas y minutos de espera. Los agregados posteriores llevan NUEVO con su hora. Actualización automática y aviso/reconexión mediante el hook Socket.IO existente; botón de consulta manual.
- Pedidos y Caja muestran la preparación en las tarjetas y el detalle seleccionado al recibir avisos. Caja conserva el monto escrito cuando cambia la preparación. Cocina se vuelve a montar al cambiar de centro y descarta respuestas antiguas.
- API exige la versión vigente del pedido además del estado anterior: si llegaron productos durante la preparación, una pantalla antigua no puede marcarlos listos sin revisarlos. Se conservan los bloqueos y reintentos seguros del avance anterior.
- Verificación final: API 14 unitarias y 72 de integración (8 de Cocina); web 53 pruebas (51 de suite completa más 2 pruebas nuevas de ruta/permisos, ejecutadas en `app.test.tsx`). Build y lint de ambas aplicaciones correctos, con los 5 avisos web previos y aviso previo de tamaño del paquete. API local `/salud` correcta, `/cocina` exige sesión (401 sin token), y Vite sirve la pantalla nueva (200). No se usaron credenciales reales en las pruebas ni se crearon pedidos de prueba en la base del usuario.
- Falta únicamente la prueba visual del usuario con cuentas reales en dos pestañas/dispositivos; guía detallada en `docs/pruebas-manuales.md`. No se declara publicación ni Fase 1 aprobada para producción: siguen los pendientes de R2.
- Archivos: `apps/web/src/paginas/Cocina.tsx`, `lib/cocina.ts`, `App.tsx`, `paginas/Pedidos.tsx`, `paginas/Caja.tsx`, `pruebas/cocina.test.tsx`, `pruebas/app.test.tsx`; controlador/servicio y prueba de Cocina en API; SQL/modelo Prisma del avance anterior; guía manual y esta libreta. Avance de backend guardado en `b72e720`.

## Tarea 9 · Cocina, avance con autorización

- El usuario autorizó el 2026-11-01 añadir `pedido.estado_cocina` y pidió completar primero Cocina; la mejora del diseño de toma de pedidos se atenderá después.
- Backend funcionando: lista de comandas por centro para ADMIN/GERENTE/COCINA, sin importes ni datos de pago; pendientes de días anteriores y entregados del día de Guatemala, líneas activas y marca NUEVO para agregados posteriores. Los estados siguen PENDIENTE → EN_PREPARACION → LISTO → ENTREGADO.
- Cambio de estado con bloqueo de fila, comprobación del estado anterior, reintentos sin doble avance, auditoría con usuario y avisos Socket.IO. Cocina nunca cambia `pedido.estado`; cobrar antes de preparar conserva PAGADO y bloquea cobros/productos adicionales. Agregar productos nuevos a un pedido listo/entregado sin pagar devuelve la preparación a pendientes; reenviar la misma línea no la reinicia.
- Campo y CHECK en el SQL fuente, actualización repetible `db/05_estado_cocina.sql` aplicada a la base local y modelo/cliente Prisma actualizados. Bases anteriores conservan el estado de preparación conocido; no se modificaron las funciones de cobro. Las líneas iniciales comparten la hora de creación para distinguirlas de agregados.
- Pruebas de esta parte: 14 unitarias y 71 de integración de API, incluidas 7 nuevas de Cocina (Socket real, pago antes de cocinar, concurrencia, agregados/anulados, días anteriores, permisos y actualización de bases existentes). Build y lint de API correctos. Falta terminar/verificar interfaz y avisos visibles en Caja/Pedidos.

## Productos del menú La Iguana cargados

- Corregido el alcance de la carga anterior: faltaban los productos. Se recorrieron 29 páginas públicas, incluidas las subcategorías, y se obtuvieron 143 productos del menú. Los 9 shukos tienen dos tamaños con precios propios: se guardan como 18 opciones; total importado: 152 productos vendibles en las 12 categorías.
- Cantidades por categoría: Lasaña 3, Entradas 5, Hamburguesas 9, Pizzas personales 19, Pizzas grandes 26, Don Calzone 20, Enrrollados 20, Cono pizza 20, Tortillas de harina 5, Shukos 18, Extras 3 y Bebidas 4. Se conservaron los dos productos de ejemplo; total local 154.
- Se identifican los productos con nombres como «Pizza personal - Pepperoni» y «Shuko - Americano - Grande», para distinguirlos al tomar pedidos. Se conservaron los precios publicados, incluidos los tamaños. No se modificaron tablas, triggers ni funciones.
- Fuente y captura con precios y enlaces por producto: `docs/datos/menu-iguana.json`. Extracción pública sin ejecutar scripts del sitio: `apps/web/scripts/extraer-menu-iguana.mjs`. Carga local transaccional con SKU estable: `apps/api/scripts/cargar-menu-iguana.mjs`. Instrucciones en `docs/datos/README.md`.
- Verificación: simulación con ROLLBACK, carga real y nueva carga con 0 productos nuevos; comprobados los 152 nombres, precios y categorías contra la captura. El servicio real de Catálogo devuelve los 152 disponibles en el centro 1 y las 12 categorías; comprobados además precios de pizza personal/grande y shukos grande Americano Q40 y Al Pastor Q65. Pasan 14 pruebas unitarias de API y 5 de integración de catálogo. No se afirma una inspección visual del navegador del usuario; debe recargar Catálogo o Pedidos.

## Categorías del menú La Iguana cargadas

- A petición del usuario se consultó el menú público [shukoslaiguana.com](https://shukoslaiguana.com/) el 2026-11-01 y se cargaron sus 12 categorías, en el orden publicado: LASAÑA, ENTRADAS, HAMBURGUESAS, PIZZAS PERSONALES, PIZZAS GRANDES, DON CALZONE, ENRROLLADOS, CONO PIZZA, TORTILLAS DE HARINA, SHUKOS, EXTRAS y BEBIDAS. Se preservó el nombre comercial publicado ENRROLLADOS.
- La base local tenía Platos y Bebidas. Se crearon 11 categorías; Bebidas se reutilizó sin cambiar su ID/nombre y se ordenó en el lugar 12. Se conserva Platos y todos los productos existentes. Total actual: 13 categorías, todas activas. Las categorías son globales según el esquema actual.
- Script de datos repetible `db/04_categorias_iguana.sql`: transacción y comparación de nombres sin distinguir mayúsculas ni espacios laterales, para no duplicar Bebidas/BEBIDAS. No modifica tablas, triggers ni funciones.
- Verificado primero con ROLLBACK, luego carga real y segunda ejecución sin duplicados. Se comprobó que existe exactamente una fila por cada categoría del menú. Pasan 14 pruebas unitarias de API y 4 de integración de Catálogo.
- La carga inicial solo incluyó categorías. La carga de productos y precios ya se completó; ver la sección anterior. Se ven al recargar Catálogo o Pedidos.
- Archivos: `db/04_categorias_iguana.sql` y `ESTADO.md`.

## Ajuste solicitado: cantidades y catálogo real

- La nueva captura del usuario confirma que ya carga la interfaz actual: selector de centro, Usuarios y formulario Nuevo pedido. Resuelta la incidencia visual de la versión anterior.
- Corregida la cantidad del borrador: `min=1`, `step=1` y máximo 999999 unidades. Antes las flechas aumentaban 0.01 y producían 1.01 platos. El guardado también valida unidades enteras con mensaje en español. Se mantienen los centavos de los precios; no se cambió el esquema ni la precisión admitida por la API.
- Verificado con pruebas: 1 → 2 al incrementar; dos platos de Q45 suman Q90; otra línea suma Q135; no se envía 1.01 al guardar. Web: 44 pruebas, build correcto y lint sin errores (avisos previos). El módulo servido en 5173 contiene el incremento entero.
- El usuario pidió cargar sus productos y precios, pero solo llegó la captura con los dos ejemplos existentes. Se solicitó la lista, categorías, precios, centro y detalle de los posibles combos/módulos. No se inventaron datos ni se modificó el catálogo mientras falta esa información.
- Archivos: `apps/web/src/paginas/Pedidos.tsx`, `apps/web/src/pruebas/app.test.tsx`, `docs/pruebas-manuales.md` y esta libreta.

## Incidencia local: el navegador muestra pantallas antiguas

- El usuario aportó capturas con todas las secciones en construcción y sin selector de centro ni Usuarios. Es la interfaz anterior, aunque las fuentes que entrega `localhost:5173` ya contienen las pantallas nuevas. La inspección automática de su navegador no estuvo disponible; su URL exacta y la confirmación visual siguen pendientes.
- Detectado un fallo de recuperación: en desarrollo `/sw.js` devolvía HTML. Eso impide actualizar un Service Worker previo registrado por una compilación de la PWA. Se sirve ahora un worker de retiro solo en desarrollo, en la misma ruta, con JavaScript y `Cache-Control: no-store`. Retira su registro y recarga sus pestañas; no borra cachés, sesión ni IndexedDB. En desarrollo no se registra una PWA nueva; producción conserva Workbox y la PWA instalable.
- Vite queda fijado al puerto 5173 con `strictPort`, para no arrancar silenciosamente en otro puerto.
- Al cargar la entrada de desarrollo se solicita también actualizar cualquier registro existente, para que una recarga forzada retire el worker anterior sin esperar a una comprobación periódica del navegador.
- Verificado: endpoint de retiro HTTP 200/JavaScript/no-store, cinco módulos nuevos HTTP 200, worker de producción con `precacheAndRoute`; 42 pruebas de app, build correcto y lint sin errores (5 avisos anteriores). Falta que el usuario recargue la dirección exacta y confirme la pantalla; no se afirma haberla validado en su navegador.
- Archivos: `apps/web/pwa-desarrollo.ts`, `vite.config.ts`, `src/main.tsx`, `src/pruebas/pwa-desarrollo.test.ts`, esta libreta y `docs/pruebas-manuales.md`.
- Incidencia previa del login: la API iniciada dentro del entorno restringido no podía descargar los certificados públicos de Firebase. Se reinició con permiso de red y el usuario confirmó que pudo entrar; no se cambió su contraseña ni su cuenta.

## Tarea actual

Tarea 9 · Cocina en tiempo real terminada y probada automáticamente. El usuario pidió priorizar su cierre; rediseño de Pedidos queda anotado para después. Publicación tiene preparación local, pendiente de aprobación/configuración y seguridad R2.

## Si está a medias: qué falta y qué archivos se tocaron

- Tarea 9: conexiones Socket.IO autenticadas, salas por centro calculadas por el servidor, notificación después de guardar pedidos/agregados/anulaciones y actualización de Pedidos al conectar o recibir avisos. Desconecta usuarios desactivados antes de publicar un aviso. La app avisa al perder conexión y reconecta sola.
- **Resuelto:** pantalla Cocina y preparación independiente del cobro, con cambio de esquema autorizado; ver el cierre de Tarea 9 al inicio.
- Archivos: `apps/api/src/tiempo-real/`, `src/pedidos/pedidos.module.ts` y `pedidos.service.ts`, `test/tiempo-real.e2e-spec.ts`; dependencias/package-lock de API y app; hook `apps/web/src/hooks/useTiempoReal.ts`, integración en `paginas/Pedidos.tsx` y pruebas `pruebas/tiempo-real.test.tsx` y `app.test.tsx`.
- Pruebas al guardar esta parte: API 13 unitarias y 43 de integración; app 32. Conexiones reales de Socket.IO prueban aviso sin recargar, aislamiento por centro y desactivación. La app prueba token/centro, reconexión y limpieza al cambiar centro. Build y lint correctos (los mismos 5 avisos anteriores en app).
- Tarea 13: Dockerfile de API, contexto restringido, Firebase Hosting, CI y publicación con identidad federada preparada pero desactivada, soporte ADC en Cloud Run y guía `docs/publicacion.md` con propuesta de costos. No se pudo construir el contenedor local porque `docker` no está disponible; tampoco se ejecutó GitHub Actions ni se hizo push. Falta aprobación de plan/costo, configurar proyecto/IAM/secretos/CI, resolver seguridad de R2 y validar el flujo con cuentas reales antes de publicar (Cocina ya terminada).
- Últimas pruebas: API 14 unitarias y 64 de integración; app 41 (también pasan con la configuración ficticia de Firebase prevista en CI). Build/lint correctos. Arranque real del JS compilado en puerto temporal 3099 y `/salud` correctos; se detuvo ese proceso al terminar. Los catálogos de producción se prueban en una base temporal vacía y no crean usuarios, centros ni turnos ficticios.
- Archivos de preparación: `.dockerignore`, `.github/workflows/verificar-y-publicar.yml`, `firebase.json`, `apps/api/Dockerfile`, `apps/api/package.json`, autenticación Firebase y su prueba, `main.ts`, `.env.example`, `.gitignore`, pruebas de catálogos de producción, `db/03_catalogos_produccion.sql`, `docs/publicacion.md` y `docs/ejemplos/README.md`. El SQL 01 de tablas/triggers/funciones no se modificó.

## Tareas terminadas

| Tarea | Nombre | Commit |
|---|---|---|
| 0 | Preparación (carpetas, esquema, especificación, AGENTS.md, CLAUDE.md) | `6338a5a` y `6515173` |
| 1 | Base de datos local (Docker Compose + 7 casos) | `58178dd` |
| 2 | API (NestJS 12 + Prisma 7 + /salud + errores en español) | `314b43f` |
| 3 | App (React 19 + Vite 8 + Tailwind 4 + shadcn/ui, PWA, indicador de /salud) | `a887efe` |
| 4 | Login con Firebase (API verifica token + GET /sesion; app con login y sesión guardada) | `3c2a748` y ver `git log --grep "Tarea 4"` (login real probado por el usuario el 2026-10-31) |
| 5 | Permisos por rol y centro (menú por rol, bloqueo en app y API, elegir centro, pantalla de usuarios) | `cd8af40` y ver `git log --grep "Tarea 5"` |
| R1 | Revisión de tareas 0 a 5 y correcciones mínimas | Ver `git log --grep "Tarea R1"` |
| 6 | Categorías, productos y precio y disponibilidad por centro | Ver `git log --grep "Tarea 6"` |
| 7 | Apertura, cierre e historial de turnos por centro | Ver `git log --grep "Tarea 7"` |
| 8 | Pedidos con folio, líneas con usuario/hora y anulación con motivo | `ced9d1e` y ver `git log --grep "Tarea 8"` |
| 9 | Cocina, estados independientes, agregados NUEVO y avisos a Pedidos/Caja | `b72e720` y ver `git log --grep "Tarea 9"` |
| 10 | Caja, cobros divididos, vuelto, comprobante y bloqueos contra duplicados | Ver `git log --grep "Tarea 10"` |
| 11 | Reportes por centro y rango, historial y descarga CSV | Ver `git log --grep "Tarea 11"` |
| 12 (parte disponible) | Pruebas automáticas aisladas y guía manual; falta validar Cocina al terminar Tarea 9 | Ver `git log --grep "Tarea 12"` |
| R2 | Revisión de partes implementadas de Tareas 6 a 12; no aprueba todavía Cocina ni publicación | Ver `git log --grep "Tarea R2"` |

Notas:
- Tarea 0: el plan dice `db/01_esquema_v0.2.sql`, pero el proyecto ya usa `db/01_esquema_v0.3.sql`, que corrige los 8 puntos de `REVISION.md`. La v0.3 es la fuente de verdad.
- Tarea 1: los 7 casos se tomaron de la página de Notion (sección 6): cobro doble, voucher repetido, cobro mayor al saldo, productos en pedido pagado, dos turnos abiertos, pago dividido y conciliación con el POS.
- La zona horaria de Guatemala se pone en `docker-compose.yml` (`timezone=America/Guatemala`), sin cambiar el esquema.
- Tarea 2: Prisma quedó fijo en **7.10.1** (la etiqueta "latest" de npm apunta a una versión de prueba 8.0 RC). Prisma 7 usa `prisma.config.ts` y el adaptador `@prisma/adapter-pg`.
- Tarea 2: la conexión de la API pone `search_path=ventas` y `timezone=America/Guatemala`; es necesario porque los triggers llaman a sus funciones sin el prefijo `ventas.`.
- Tarea 2: se borraron archivos que generan las herramientas y que no son del proyecto: `apps/api/AGENTS.md` (publicidad de NestJS Observe), las carpetas de skills de Prisma y el script `deploy` de NestJS.
- Tarea 2: todos los errores salen como `{ statusCode, mensaje }` en español. Los mensajes de los triggers (código P0001) pasan tal cual; los demás se traducen en `apps/api/src/comun/errores-bd.ts`.
- Tarea 3: la app lee `VITE_API_URL` del `.env` de la raíz (`envDir: '../..'`). Solo las variables `VITE_` llegan al navegador.
- Tarea 3: shadcn/ui (estilo base-nova) usa el paquete `cn` (oficial de shadcn, sin dependencias) en vez de clsx + tailwind-merge, y `@base-ui/react` para los componentes.
- Tarea 3: el Service Worker solo guarda los archivos de la app para que sea instalable; no guarda datos de la API (eso es la Tarea 17).
- Tarea 3: `npm run lint` da 3 avisos (no errores): dos en componentes de shadcn y uno en `useSaludApi` (falso positivo: el setState ocurre después de un await).
- Aviso para la Tarea 7: Prisma interpretó el índice parcial `uq_turno_abierto` como si cada centro tuviera un solo turno (`centro_venta.turno_caja turno_caja?`). Para consultar turnos de un centro usar `prisma.turno_caja.findMany({ where: { centro_venta_id } })`, no la relación desde centro_venta.
- Tarea 3: verificado en Chrome: la app abre, dice "API conectada" y no hay errores en la consola.
- Tarea 4: la API verifica los tokens solo con `FIREBASE_PROJECT_ID` (no necesita clave secreta). Todas las rutas piden sesión salvo las marcadas con `@Publica()` (por ahora solo `/salud`). El usuario de la sesión se obtiene con `@UsuarioActual()`.
- Tarea 4: el ADMIN recibe todos los centros activos; los demás roles, solo los de `usuario_centro`.
- Tarea 4: la configuración web de Firebase se pasó del `.txt` local al `.env` (variables `VITE_FIREBASE_*`). En el código no hay claves.
- Tarea 4: en las pruebas, Firebase se simula (API: `VerificadorFalso`, token `token-<uid>`; app: `vi.mock('@/lib/firebase')`). Ninguna prueba usa el proyecto real.
- Tarea 4: verificado en Chrome que la pantalla de login abre sin errores. No se probó entrar con una cuenta real (los agentes no escriben contraseñas en servicios reales).
- Tarea 4 (corregido en la Tarea 5): la API solo revisa si la sesión fue revocada cuando hay cuenta de servicio; sin la clave, Firebase no permite esa revisión y el login real habría fallado.
- Tarea 5: permisos en la API con `@Roles('ADMIN', ...)` en la ruta o el controlador (sin el decorador, cualquier usuario con sesión entra). El mapa de roles por pantalla está en `apps/web/src/secciones.ts`: MESERO → Pedidos; COCINA → Cocina; CAJERO → Pedidos, Caja y Turnos; GERENTE → todo menos Usuarios; ADMIN → todo.
- Tarea 5: el centro elegido viaja en el encabezado `X-Centro-Id`; la API revisa que sea uno de los centros del usuario y los controladores lo leen con `@CentroActual()` (responde "Elige un centro de venta para continuar." si falta). Las tareas 6 en adelante deben usar `@CentroActual()` para filtrar por centro.
- Tarea 5: en la app, `useSesion().api(ruta, opciones)` manda el token y el centro. Con un solo centro se elige solo; con varios, se pregunta al entrar y se recuerda en el navegador.
- Tarea 5: crear un usuario: (a) con contraseña inicial, la API lo crea en Firebase (necesita la cuenta de servicio; si no está, responde un mensaje claro), o (b) con el UID de un usuario creado en la consola de Firebase (funciona sin la clave). Se revisa que el correo no exista en la base antes de tocar Firebase, y si la base falla después, se borra lo creado en Firebase.
- Tarea 5: desactivar un usuario quita el acceso de inmediato (la API revisa `usuario.activo` en cada solicitud). Con cuenta de servicio, además lo bloquea en Firebase. El ADMIN no puede desactivarse a sí mismo.

## Siguiente tarea

Cocina y sus pruebas automáticas terminadas. Siguiente del plan: cerrar validación manual de Fase 1 y completar revisión R2 de Cocina/pendientes antes de publicar. El usuario también pidió mejorar el diseño de Pedidos después de Tarea 9. La Tarea 13 espera aprobación/configuración y resolver los pendientes de R2. La Tarea 14 necesita el archivo real del POS; requisitos en `docs/ejemplos/README.md`. No crear servicios ni habilitar `PUBLICAR_APROBADO` sin aprobación.

### Resultado de R2

- Revisadas las partes implementadas de Tareas 6 a 12 contra plan, especificación y esquema: precios/centros, folios e idempotencia, líneas/autoría, cobros/saldo/voucher, coordinación cierre-cobro, comprobantes, permisos, reportes/descuentos y aislamiento de pruebas. Cocina sigue incompleta; no se aprueba la Fase 1 completa.
- Correcciones mínimas: el borrador ahora redondea cada línea a centavos antes de sumar, igual que PostgreSQL, con BigInt para evitar pérdida de precisión. Socket.IO vuelve a verificar el token antes de cada aviso y desconecta sesiones vencidas; antes solo verificaba el token al conectar.
- Pruebas finales de esta revisión: API 13 unitarias y 63 de integración (incluyen los 7 casos SQL); app 41. Build y lint correctos. Se mantienen los avisos de lint, tamaño web y deprecación de consultas concurrentes de `pg`; no se hicieron cambios de arquitectura, librerías ni SQL durante R2.
- Auditoría de dependencias de producción (`npm.cmd audit --omit=dev --json`, 2026-10-31): API 6 avisos moderados; app 10 avisos propagados (4 altos, 4 moderados y 2 bajos). No equivale a 10 fallos explotables independientes. Detalles y acciones separadas abajo; no se ejecutó `audit fix` ni se cambiaron versiones en esta revisión.
- Archivos corregidos: `apps/api/src/tiempo-real/tiempo-real.gateway.ts` y su prueba; `apps/web/src/lib/importes.ts`, `paginas/Pedidos.tsx` y `pruebas/importes.test.ts`.

### Resultado de Tarea 12 (parte disponible)

- Todas las pruebas de integración usan bases temporales aleatorias creadas desde los SQL originales. Se elimina la base temporal incluso al fallar una prueba; no se ejecutan limpiezas sobre datos de desarrollo. Resuelto el pendiente R1 de aislamiento.
- `test:e2e` ejecuta también los siete casos originales completos y comprueba su ROLLBACK, además de la matriz de los cinco roles en las secciones implementadas, permisos por centro, folios/cobros/vouchers simultáneos, saldo, pagos divididos, turno único y bloqueos de pedidos pagados.
- Resultado: API 13 unitarias y 62 de integración; app 39. Build y lint correctos; quedan los avisos ya registrados. No se han ejecutado las pruebas manuales con cuentas reales del usuario.
- Guía `docs/pruebas-manuales.md` con preparación, cuentas, catálogo, turnos, pedidos, caja, reportes, reintentos y pruebas de Cocina pendientes. La Fase 1 no se declara terminada mientras falte Tarea 9.
- Archivos: `apps/api/test/base-aislada.ts`, todas las suites e2e para inyectar la base aislada, nuevas suites `casos-sql.e2e-spec.ts` y `fase1-permisos.e2e-spec.ts`, y guía manual.

### Resultado de Tarea 11

- Reportes solo ADMIN/GERENTE, por centro y rango válido de hasta 366 días. Incluye pedidos PAGADOS según fecha de operación; excluye anulados y pedidos con saldo pendiente, aunque tengan abonos. Las formas de pago corresponden a esos mismos pedidos.
- Total de pedidos, total vendido, ticket promedio, descuentos, ventas por tipo, hora de Guatemala y producto, desglose de pagos, e historial de creación/líneas/anulaciones/cobros con nombre y hora.
- Descuentos distribuidos por producto con Decimal y reparto de centavos por residuo; todos los desgloses conservan el total neto. Consulta de ventas en transacción RepeatableRead.
- CSV con centro y rango consultados, comillas escapadas, UTF-8 y protección para que nombres que empiezan con signos de fórmula se abran como texto.
- Pruebas: API 13 unitarias y 54 de integración; app 39. Incluye ventas divididas, abonos excluidos, centavos/descuentos, fechas, permisos, historial y descarga CSV. Build y lint correctos; 5 avisos anteriores en app y aviso de tamaño del paquete web (504 kB); no se reorganizó la carga de pantallas en esta tarea.
- Archivos: `apps/api/src/reportes/`, registro en `app.module.ts`, `test/reportes.e2e-spec.ts`; página `apps/web/src/paginas/Reportes.tsx`, `lib/csv.ts`, ruta y pruebas `csv.test.ts` y `app.test.tsx`.

### Resultado de Tarea 10

- Caja para ADMIN/GERENTE/CAJERO: pendientes de cualquier día del centro, búsqueda por folio/fecha/mesa/cliente, detalle, total/pagado/saldo, efectivo y vuelto, tarjeta con terminal/autorización obligatorias, transferencia con referencia y pagos parciales/divididos.
- Cobros con bloqueo de turno y pedido; el cierre usa el mismo bloqueo. Se verifica saldo, estado, turno, método y voucher antes de insertar; el SQL repite sus controles. UUID de pago idempotente, incluso si el turno cerró después. Un resultado incierto bloquea los campos en la app y reintenta exactamente el mismo pago.
- Comprobante en pantalla con folio, productos, total, pagos y autorización; actualizado por avisos en tiempo real. La impresión térmica corresponde a Tarea 19. El efectivo recibido y vuelto se muestran al cobrar; el esquema no almacena esos dos datos.
- Pruebas: API 13 unitarias y 51 de integración; app 35. Incluye dos cobros simultáneos, voucher simultáneo entre centros, reenvío después del cierre, pago dividido, saldo excedido, permisos, cierre/cobro simultáneos y reintento con el mismo UUID. Build y lint correctos; 5 avisos previos en la app.
- Nueva utilidad `test/base-aislada.ts`: las pruebas de Caja crean una base local aleatoria desde los scripts originales y la eliminan al terminar, con verificación del nombre. No dejan pagos en la base de desarrollo. La cuenta local necesita permiso CREATEDB para estas pruebas.
- Archivos: `apps/api/src/caja/`, `app.module.ts`, `pedidos.service.ts`, `test/base-aislada.ts` y `caja.e2e-spec.ts`; `apps/web/src/paginas/Caja.tsx`, `App.tsx` y pruebas de la app.

### Resultado de Tarea 8

- API con UUID idempotentes, folio de `siguiente_folio`, fecha de Guatemala y precios del centro calculados por el servidor. Bloquea el pedido al agregar/anular líneas; motivo obligatorio. Los pedidos pagados/anulados no admiten productos nuevos.
- Pantalla de pedidos del día con folio/estado/total/hora y buscador; venta por mesa/para llevar/domicilio/app; productos por categoría, cantidades y notas; agregar después y ver quién/cuándo; anular línea con motivo.
- La app genera UUID de pedido y líneas al iniciar el borrador/agregar productos. Un reintento conserva los IDs y no duplica el pedido. Todavía no se guarda el borrador al cerrar la app: el modo sin internet corresponde a la Fase 3.
- Pruebas: API 13 unitarias y 40 de integración; app 30. Incluye dos folios simultáneos 1 y 2, reenvío, precio del servidor, usuario/hora de agregados, anulación, estados terminales y recorrido de la app. Build y lint correctos, mismos 5 avisos anteriores de la app. `pg` emitió un aviso de deprecación de consultas concurrentes de Prisma, sin fallos.
- Archivos: módulo `apps/api/src/pedidos/`, registro en `app.module.ts`, exportación en `catalogo.module.ts`, `test/pedidos.e2e-spec.ts`, página `apps/web/src/paginas/Pedidos.tsx`, ruta y pruebas de la app.

### Resultado de Tarea 7

- `/turnos` para ADMIN/GERENTE/CAJERO: apertura con fondo, un turno abierto por centro, aviso con nombre y hora del turno existente; cierre una sola vez con efectivo contado; historial filtrado por centro.
- La fecha de operación viene de `fecha_guatemala()` en la base. La pantalla muestra las horas de Guatemala. Efectivo esperado = fondo + pagos en efectivo APLICADOS; diferencia = contado - esperado. Los cálculos de la API usan Decimal.
- Cierre bajo bloqueo de fila del turno. **Para Tarea 10 y Tarea 18:** los cobros de la API deben tomar ese mismo bloqueo antes de registrar pagos para coordinar cobros y cierre. El trigger actual lee el turno sin bloquearlo; no se cambió el SQL.
- Pruebas: API 13 unitarias y 35 de integración; app 27. Incluye apertura simultánea, cierre repetido, historial, permisos, efectivo/tarjeta/anulados y centavos exactos. Compilaciones y lint correctos; quedan los mismos 5 avisos anteriores de la app.
- Archivos: módulo nuevo `apps/api/src/turnos/`, registro en `app.module.ts`, `test/turnos.e2e-spec.ts`, página `apps/web/src/paginas/Turnos.tsx`, ruta y pruebas de la app.

### Resultado de Tarea 6

- API `/catalogo`: crear/editar/ordenar/desactivar categorías; crear/editar/desactivar productos; buscar por nombre/SKU y categoría; precio y disponibilidad solo del centro elegido. Sin DELETE ni cambios al esquema.
- Pantalla Catálogo para ADMIN/GERENTE, filtros y formularios separados para datos globales y configuración del centro. Un precio propio vacío guarda NULL y usa el precio base; un precio cero se conserva. Una categoría o producto inactivo no queda disponible para venta.
- Pruebas: API 31 de integración (incluye precio distinto por centro, cero, NULL, permisos, validaciones y desactivación); app 25 (incluye cambio de centro, precio mostrado, búsqueda y guardado). Compilación y lint de ambas correctos, con los mismos 5 avisos previos de la app.
- Archivos: módulo nuevo `apps/api/src/catalogo/`, registro en `app.module.ts`, prueba `test/catalogo.e2e-spec.ts`, página `apps/web/src/paginas/Catalogo.tsx`, ruta en `App.tsx` y pruebas en `src/pruebas/app.test.tsx`.

### Resultado de R1

- Revisados los commits de Claude de tareas 1 a 5, estructura, esquema y Prisma, configuración de PWA, secretos excluidos de Git, fecha de Guatemala, errores, login y permisos contra AGENTS.md y docs/especificacion.md.
- Correcciones mínimas: `/centros` devuelve solo los centros autorizados del usuario; al cambiar el usuario editado se reinicia su formulario; una respuesta atrasada de `/sesion` no restaura una sesión cerrada ni reemplaza una sesión posterior.
- Verificación: API 13 pruebas unitarias y 27 de integración; app 23 pruebas. Compilaciones de API y app correctas; lint sin errores (5 avisos existentes en la app).
- Los 7 casos SQL pasan. Como Docker no está en el PATH de esta sesión, se ejecutó el mismo archivo con `pg` y DATABASE_URL, quitando únicamente las dos instrucciones propias de psql; la transacción termina en ROLLBACK. Se eliminó el ejecutor temporal.
- No se modificó el esquema ni se crearon servicios. No se repitió el login real: ya lo validó el usuario. Los archivos locales sin seguimiento `REVISION.md` y `Modo relevo Claude Code y Codex.pdf` se conservaron fuera de los commits.

## Pendientes para el otro agente

- R1 · **Resuelto en Tarea 12:** todas las pruebas de integración usan bases temporales, sin limpiar usuarios ni ventas de la base de desarrollo.
- R1 · La relación Prisma `centro_venta.turno_caja` representa como uno-a-uno el índice parcial de turno abierto, aunque puede haber varios turnos cerrados. Ya advertido arriba; revisar la representación en una tarea separada, sin cambiar el SQL.
- R1 · La reactivación en Firebase puede fallar y solo deja un aviso en el servidor (`GestorUsuariosFirebase.cambiarActivo`), aunque la pantalla confirma que quedó activo en la base. Definir cómo comunicar y reintentar ese fallo sin perder la protección al desactivar; requiere coordinar el flujo app/API.
- R2 · **Resuelto en Tarea 9:** pantalla, marcador NUEVO y preparación separada; pruebas verifican pago antes de cocinar, estados sin reabrir saldo, permisos, concurrencia y sockets. Falta validación visual con cuentas reales.
- Diseño solicitado por el usuario: mejorar la toma de pedidos y revisar la facilidad de uso de cada módulo después de cerrar Cocina. No se rediseñó Pedidos en Tarea 9.
- R2 · **Antes de publicación:** revisar/actualizar dependencias en tarea separada. API: cadena `gaxios/gcp-metadata/google-gax/rimraf/glob/minimatch` (6 moderados). App: `@grpc/grpc-js` arrastrado por Firestore/Firebase (4 avisos altos propagados), `minimatch/ts-morph` y `deepmerge/shadcn`. Referencias de npm: [grpc](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249), [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). La app importa Auth, no Firestore; verificar alcance real además de actualizar. npm propone bajar Firebase a 9.14.0 y shadcn a 1.0.0 como cambios mayores: no aplicar eso automáticamente.
- R2 · Un pedido cuyo total sea cero no tiene ruta de finalización en Caja (los pagos exigen monto positivo). Definir el flujo de cortesías/venta gratuita en tarea separada; no permitir pagos de cero saltándose el esquema.
- R2 · Socket.IO avisa dentro de una sola instancia de API. Para Cloud Run piloto limitar a una instancia; antes de escalar a varias, añadir un adaptador de difusión compartida y pruebas entre réplicas. No cambiar la arquitectura durante la revisión.
- R2 · El paquete web es de unos 505 kB y Vite avisa por tamaño. Separar carga de pantallas en una tarea de rendimiento; no se reorganizó el código durante R2.

## Necesito del usuario

1. ~~Probar el login (Tarea 4)~~ **Hecho el 2026-10-31:** el usuario entró con su cuenta real como ADMIN (usuario id 18 en la base local).
2. **Para crear usuarios con contraseña desde la pantalla Usuarios (Tarea 5):** una clave de cuenta de servicio de Firebase.
   Consola de Firebase → Configuración del proyecto → Cuentas de servicio → "Generar nueva clave privada".
   Guardar el JSON **fuera de la carpeta del proyecto** (por ejemplo `C:/claves/sirinventari-admin.json`) y poner en el `.env` de la raíz:
   `GOOGLE_APPLICATION_CREDENTIALS=C:/claves/sirinventari-admin.json`. Nunca subirlo a Git.
   Mientras no esté, se puede crear el usuario en la consola de Firebase y registrarlo en la pantalla Usuarios con la opción "Ya existe en Firebase (tengo su UID)".
3. ~~Abrir Codex para la revisión R1~~ **Hecho:** revisión ejecutada y resultados anotados arriba.
4. **Tarea 9 · Autorizado y terminado el 2026-11-01:** el usuario aprobó añadir `pedido.estado_cocina` independiente del cobro. Campo aplicado a la base local, SQL fuente/Prisma actualizados y Cocina terminada. Puede probarla en dos pestañas siguiendo la guía manual.
5. **Tarea 13 · Revisar y aprobar plan/costo en `docs/publicacion.md`.** Propuesta para un centro: `us-central1`, Cloud SQL 1 vCPU/3.75 GiB, Cloud Run 1 vCPU/1 GiB y una instancia máxima, reserva estimada USD 130/mes antes de impuestos (no es un tope automático). Confirmar proyecto/facturación, centros reales y acceso a configuración de Google Cloud/GitHub. El flujo exige `PUBLICAR_APROBADO=true` y el entorno protegido `produccion`; hoy no está habilitado. Configurar `CI_DB_PASSWORD` para las pruebas de GitHub. Docker/gcloud no están disponibles en esta sesión; el contenedor y la publicación necesitan validación posterior.
6. **Tarea 14 · Archivo real de ejemplo del cierre del POS**, anonimizado y con su formato/encabezados originales, en `docs/ejemplos`. No se inventó un archivo ni un parser.
7. **Catálogo real cargado:** fuente `https://shukoslaiguana.com/`, 12 categorías y 152 opciones de productos/precios, incluidos tamaños y extras/complementos publicados. Cantidades de la pantalla corregidas. Ver captura y carga repetible en `docs/datos/`.
8. **Tarea 19 · Impresora térmica:** conectar la impresora (USB o Bluetooth) y hacer la prueba de `docs/impresoras.md` (sin internet debe salir la comanda con folio provisional). Avisar si imprime bien o qué sale mal.

## Cómo probar lo último

Base de datos (Tarea 1):
1. Abrir Docker Desktop y, en la carpeta del proyecto: `docker compose up -d`
2. Correr los 7 casos (en Git Bash, porque PowerShell rompe las comillas):
   `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /pruebas/casos.sql'`
   Debe terminar con `LOS 7 CASOS PASARON`. No deja datos.
3. Para empezar la base de cero: `docker compose down -v` y luego `docker compose up -d`.

API (Tarea 2):
1. `cd apps/api` y `npm install` (la primera vez).
2. `npm run start:dev` y abrir http://localhost:3000/salud en el navegador.
   Debe decir `"baseDatos":"ok"` y la fecha de hoy en Guatemala.
3. Pruebas automáticas: `npm test` (13 pruebas) y `npm run test:e2e` (26 pruebas, con la base encendida).

App (Tareas 3 y 4):
1. Con la API encendida: `cd apps/web`, `npm install` (la primera vez) y `npm run dev`.
2. Abrir http://localhost:5173 : aparece la pantalla **Iniciar sesión**.
3. Entrar con el usuario creado en Firebase (ver "Necesito del usuario" punto 1). Arriba se ve tu nombre, "Administrador" y **API conectada** (verde).
4. Recargar la página: debe seguir dentro. "Cerrar sesión" vuelve al login.
5. Un usuario de Firebase que no está en la base ve: "Tu usuario no tiene acceso. Habla con el administrador."
6. Para probar la instalación como app: `npm run build` y `npm run preview`; en Chrome aparece el botón de instalar.
7. Pruebas automáticas: `npm test` (21 pruebas).

Permisos (Tarea 5), después de entrar como ADMIN:
1. Menú → **Usuarios** → "Nuevo usuario": crear un MESERO con el centro 1 (con contraseña si ya está la cuenta de servicio; si no, crearlo antes en la consola de Firebase y usar su UID).
2. Cerrar sesión y entrar como ese MESERO: el menú solo muestra **Pedidos**.
3. Escribir a mano http://localhost:5173/caja : debe decir **No tienes permiso**.
4. Como ADMIN, desactivar al MESERO: si él recarga la página, ve "Tu usuario no tiene acceso. Habla con el administrador."
5. Un usuario con dos centros elige el centro al entrar; arriba se ve el centro y el botón "Cambiar".

Las credenciales están en `.env` en la raíz (local, no se sube). La plantilla es `.env.example`.
