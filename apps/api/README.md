# API de SirInventari

NestJS + TypeScript + Prisma 7, conectada a PostgreSQL 16 (esquema `ventas`).

## Antes de empezar

1. Encender la base local desde la raíz del proyecto: `docker compose up -d`
2. Tener el archivo `.env` en la **raíz** del proyecto (copiar `.env.example`).
3. Instalar dependencias: `npm install` (genera también el cliente de Prisma).

## Comandos

| Comando | Para qué sirve |
|---|---|
| `npm run start:dev` | Arranca la API en modo desarrollo (se reinicia al guardar). |
| `npm run build` y `npm run start:prod` | Compila y arranca la versión final. |
| `npm test` | Pruebas sin base de datos. |
| `npm run test:e2e` | Pruebas contra la base de Docker (debe estar encendida). |
| `npm run lint` | Revisa el código. |
| `npm run prisma:pull` | Vuelve a leer las tablas de la base y regenera el cliente de Prisma. |

## Reglas

- **No se usan migraciones de Prisma.** La base la define `db/01_esquema_v0.3.sql`.
  Si cambia el esquema, correr `npm run prisma:pull`.
- Cada conexión usa `search_path=ventas` y la hora de `America/Guatemala`
  (ver `src/prisma/prisma.service.ts`).
- Todos los errores salen como `{ statusCode, mensaje }` en español
  (ver `src/comun/filtro-errores.ts` y `src/comun/errores-bd.ts`).

## Rutas

- `GET /salud`: responde si la API y la base funcionan, con la fecha de operación de Guatemala.
  Si la base no responde, devuelve el código 503.
