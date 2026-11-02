# ESTADO del modo relevo

Libreta compartida entre Claude Code y Codex. Se actualiza al terminar cada tarea y a mitad de las tareas grandes.

## Última actualización

2026-11-01 01:07 (hora de Guatemala) · Codex

## Avance R2 · Dependencias antes de publicación (2026-11-02)

- Retirada herramienta sin uso `@nestjs/mau` de API y fijado gRPC 1.13.6 dentro de Firestore en app. Auditorías sin avisos altos/críticos; quedan 7 moderados en API y 14 moderados/bajos en app. Detalles y límites en `docs/dependencias-seguridad.md`.
- Pasan 14 pruebas unitarias API y 53 web; build/lint correctos con avisos web previos. Integración pendiente: no hay PostgreSQL en 5432; el servicio encontrado en 5433 rechaza las credenciales locales. No se cambiaron `.env`, contraseñas ni esquema.
- Necesito del usuario: restablecer la base prevista por `DATABASE_URL` para repetir las 72 pruebas de integración. Publicación y archivo POS siguen pendientes de los puntos indicados abajo. Seguridad R2 todavía no se declara cerrada.
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
