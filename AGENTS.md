# AGENTS.md — SirInventari

## Qué es el proyecto

SirInventari es un **sistema de ventas para restaurantes con varios centros de venta**. Reemplaza las boletas de papel por pedidos digitales con folio único por centro y día, liga cada cobro del POS externo a un pedido (con el número de autorización del voucher), evita cobros duplicados y hace una conciliación diaria contra el cierre del POS. La app sigue vendiendo **sin internet** y sincroniza sola al volver la conexión.

Roles de usuario: `ADMIN`, `GERENTE`, `CAJERO`, `MESERO`, `COCINA`.

Especificación completa: `docs/especificacion.md` (resumen de la página de Notion "SISTEMA DE VENTAS").

## Stack

| Capa | Tecnología |
|---|---|
| App (frontend) | React + Vite + TypeScript (PWA) |
| Diseño | Tailwind CSS + shadcn/ui |
| API (backend) | NestJS (Node.js + TypeScript) |
| Acceso a datos | Prisma |
| Base de datos | PostgreSQL 16 (esquema `ventas`) |
| Login | Firebase Authentication |
| Tiempo real | Socket.IO |
| Servidor de la API | Google Cloud Run |
| Base de datos en la nube | Cloud SQL |
| Hosting de la app | Firebase Hosting |

## Estructura de carpetas

```
/
├── AGENTS.md              # Este archivo: contexto y reglas para los agentes
├── CLAUDE.md              # Apunta a AGENTS.md
├── apps/
│   ├── web/               # App en React (PWA)
│   └── api/               # API en NestJS
├── db/
│   ├── 01_esquema_v0.2.sql      # Tablas, triggers y funciones (FUENTE DE VERDAD)
│   └── 02_datos_iniciales.sql   # Datos de ejemplo para empezar
└── docs/
    └── especificacion.md  # Resumen de la especificación
```

## Reglas

1. **Responder siempre en español con lenguaje sencillo.**
2. **Los nombres de tablas y campos van en español**, igual que en el script de la base de datos.
3. **`db/01_esquema_v0.2.sql` es la fuente de verdad.** No cambiar tablas, triggers ni funciones sin preguntar primero y explicar por qué.
4. **Trabajar solo en la tarea pedida, en pasos pequeños**, y al final decir qué archivos se cambiaron.
5. **Nunca guardar contraseñas ni claves en el código**; usar archivos `.env` (que nunca se suben a Git).
6. **Los mensajes de error para el usuario siempre en español claro.**
7. **La fecha de operación se calcula con la hora de Guatemala** (`America/Guatemala`), no con UTC.
