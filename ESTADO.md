# ESTADO del modo relevo

Libreta compartida entre Claude Code y Codex. Se actualiza al terminar cada tarea y a mitad de las tareas grandes.

## Última actualización

2026-10-31 19:08 (hora de Guatemala) · Claude Code

## Tarea actual

Tarea 1 · Base de datos local. **Terminada.**

## Si está a medias: qué falta y qué archivos se tocaron

- (nada a medias)

## Tareas terminadas

| Tarea | Nombre | Commit |
|---|---|---|
| 0 | Preparación (carpetas, esquema, especificación, AGENTS.md, CLAUDE.md) | `6338a5a` y `6515173` |
| 1 | Base de datos local (Docker Compose + 7 casos) | ver `git log --grep "Tarea 1"` |

Notas:
- Tarea 0: el plan dice `db/01_esquema_v0.2.sql`, pero el proyecto ya usa `db/01_esquema_v0.3.sql`, que corrige los 8 puntos de `REVISION.md`. La v0.3 es la fuente de verdad.
- Tarea 1: los 7 casos se tomaron de la página de Notion (sección 6): cobro doble, voucher repetido, cobro mayor al saldo, productos en pedido pagado, dos turnos abiertos, pago dividido y conciliación con el POS.
- La zona horaria de Guatemala se pone en `docker-compose.yml` (`timezone=America/Guatemala`), sin cambiar el esquema.

## Siguiente tarea

Tarea 2 ★ · API (NestJS + Prisma + ruta /salud).

## Pendientes para el otro agente

- (ninguno)

## Necesito del usuario

- (nada por ahora)
- Más adelante (Tarea 4): las claves de Firebase Admin (cuenta de servicio). La configuración web de Firebase ya está en el archivo local `PROYECTO PARA QUE TE CONECTES A FIREBASE ... .txt`, que Git ignora; se pasará a `.env`.

## Cómo probar lo último

1. Abrir Docker Desktop.
2. En la carpeta del proyecto: `docker compose up -d`
   (la primera vez crea la base `sistema_ventas` y ejecuta los scripts de `db/`).
3. Correr los 7 casos:
   `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /pruebas/casos.sql'`
   Debe terminar con `LOS 7 CASOS PASARON`. La prueba no deja datos (todo se deshace al final).
   En PowerShell las comillas se rompen: usar Git Bash para este comando.
4. Para empezar la base de cero: `docker compose down -v` y luego `docker compose up -d`.
- Las credenciales están en `.env` (local, no se sube). La plantilla es `.env.example`.
