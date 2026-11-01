# ESTADO del modo relevo

Libreta compartida entre Claude Code y Codex. Se actualiza al terminar cada tarea y a mitad de las tareas grandes.

## Última actualización

2026-10-31 20:20 (hora de Guatemala) · Claude Code

## Tarea actual

Tarea 5 · Permisos por rol y centro. **Terminada.**

## Si está a medias: qué falta y qué archivos se tocaron

- (nada a medias)

## Tareas terminadas

| Tarea | Nombre | Commit |
|---|---|---|
| 0 | Preparación (carpetas, esquema, especificación, AGENTS.md, CLAUDE.md) | `6338a5a` y `6515173` |
| 1 | Base de datos local (Docker Compose + 7 casos) | `58178dd` |
| 2 | API (NestJS 12 + Prisma 7 + /salud + errores en español) | `314b43f` |
| 3 | App (React 19 + Vite 8 + Tailwind 4 + shadcn/ui, PWA, indicador de /salud) | `a887efe` |
| 4 | Login con Firebase (API verifica token + GET /sesion; app con login y sesión guardada) | `3c2a748` y ver `git log --grep "Tarea 4"` (falta prueba del usuario) |
| 5 | Permisos por rol y centro (menú por rol, bloqueo en app y API, elegir centro, pantalla de usuarios) | `cd8af40` y ver `git log --grep "Tarea 5"` |

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

**Siguiente: revisión de Codex (R1).** Revisión a fondo de las tareas 0 a 5 contra AGENTS.md y docs/especificacion.md. Solo la hace Codex; Claude Code se detiene aquí.
Después de R1 sigue la Tarea 6 · Catálogo.

## Pendientes para el otro agente

- (ninguno)

## Necesito del usuario

1. **Probar el login (Tarea 4):**
   - En la consola de Firebase → Authentication → Sign-in method: confirmar que "Correo electrónico/contraseña" esté activado.
   - Authentication → Users → "Add user": crear tu usuario con tu correo y una contraseña. Copiar su **User UID**.
   - En `apps/api`: `npm run crear-admin -- --uid <User UID> --email <tu correo> --nombre "Tu nombre"`
   - Encender la API (`npm run start:dev` en `apps/api`) y la app (`npm run dev` en `apps/web`), entrar en http://localhost:5173 y recargar la página: debe seguir dentro.
2. **Para crear usuarios con contraseña desde la pantalla Usuarios (Tarea 5):** una clave de cuenta de servicio de Firebase.
   Consola de Firebase → Configuración del proyecto → Cuentas de servicio → "Generar nueva clave privada".
   Guardar el JSON **fuera de la carpeta del proyecto** (por ejemplo `C:/claves/sirinventari-admin.json`) y poner en el `.env` de la raíz:
   `GOOGLE_APPLICATION_CREDENTIALS=C:/claves/sirinventari-admin.json`. Nunca subirlo a Git.
   Mientras no esté, se puede crear el usuario en la consola de Firebase y registrarlo en la pantalla Usuarios con la opción "Ya existe en Firebase (tengo su UID)".
3. **Abrir Codex para la revisión R1** (ver el documento "Modo relevo", mensaje para Codex).

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
