# ESTADO del modo relevo

Libreta compartida entre Claude Code y Codex. Se actualiza al terminar cada tarea y a mitad de las tareas grandes.

## Última actualización

2026-10-31 19:22 (hora de Guatemala) · Claude Code

## Tarea actual

Tarea 2 · API. **Terminada.**

## Si está a medias: qué falta y qué archivos se tocaron

- (nada a medias)

## Tareas terminadas

| Tarea | Nombre | Commit |
|---|---|---|
| 0 | Preparación (carpetas, esquema, especificación, AGENTS.md, CLAUDE.md) | `6338a5a` y `6515173` |
| 1 | Base de datos local (Docker Compose + 7 casos) | `58178dd` |
| 2 | API (NestJS 12 + Prisma 7 + /salud + errores en español) | ver `git log --grep "Tarea 2"` |

Notas:
- Tarea 0: el plan dice `db/01_esquema_v0.2.sql`, pero el proyecto ya usa `db/01_esquema_v0.3.sql`, que corrige los 8 puntos de `REVISION.md`. La v0.3 es la fuente de verdad.
- Tarea 1: los 7 casos se tomaron de la página de Notion (sección 6): cobro doble, voucher repetido, cobro mayor al saldo, productos en pedido pagado, dos turnos abiertos, pago dividido y conciliación con el POS.
- La zona horaria de Guatemala se pone en `docker-compose.yml` (`timezone=America/Guatemala`), sin cambiar el esquema.
- Tarea 2: Prisma quedó fijo en **7.10.1** (la etiqueta "latest" de npm apunta a una versión de prueba 8.0 RC). Prisma 7 usa `prisma.config.ts` y el adaptador `@prisma/adapter-pg`.
- Tarea 2: la conexión de la API pone `search_path=ventas` y `timezone=America/Guatemala`; es necesario porque los triggers llaman a sus funciones sin el prefijo `ventas.`.
- Tarea 2: se borraron archivos que generan las herramientas y que no son del proyecto: `apps/api/AGENTS.md` (publicidad de NestJS Observe), las carpetas de skills de Prisma y el script `deploy` de NestJS.
- Tarea 2: todos los errores salen como `{ statusCode, mensaje }` en español. Los mensajes de los triggers (código P0001) pasan tal cual; los demás se traducen en `apps/api/src/comun/errores-bd.ts`.

## Siguiente tarea

Tarea 3 ★ · App (React + Vite + Tailwind + shadcn/ui, PWA).

## Pendientes para el otro agente

- (ninguno)

## Necesito del usuario

- (nada por ahora)
- Más adelante (Tarea 4): las claves de Firebase Admin (cuenta de servicio). La configuración web de Firebase ya está en el archivo local `PROYECTO PARA QUE TE CONECTES A FIREBASE ... .txt`, que Git ignora; se pasará a `.env`.

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
3. Pruebas automáticas: `npm test` (11 pruebas) y `npm run test:e2e` (5 pruebas, con la base encendida).

Las credenciales están en `.env` en la raíz (local, no se sube). La plantilla es `.env.example`.
