# AGENTS.md — SirInventari

## Reglas para los agentes

1. **Responde siempre en español, con lenguaje sencillo.** Explica como si hablaras con alguien que está aprendiendo: frases cortas y sin jerga innecesaria. Si usas un término técnico, explícalo en pocas palabras.
2. **No cambies archivos que no tengan que ver con la tarea pedida.** Si ves algo que convendría mejorar en otro archivo, avísalo, pero no lo toques sin permiso.

## Descripción del proyecto

SirInventari es un sistema de ventas para restaurantes con varios **centros de venta**. Su objetivo es:

- Reemplazar las boletas de papel por **pedidos digitales con folio único por centro y día**.
- Registrar el **tipo de venta** (mesa, para llevar, domicilio, app) y lo que se agrega a un pedido, con hora y usuario.
- Ligar cada cobro del POS externo a un pedido, guardando el **número de autorización del voucher**.
- **Evitar cobros duplicados** (pedido ya pagado, voucher ya usado, monto mayor al saldo) y hacer una **conciliación diaria** contra el cierre del POS.
- Seguir vendiendo **sin internet**: la app guarda pedidos y cobros en la tablet con folio provisional (ej. `CAJA1-0007`) y los envía solos cuando vuelve la conexión. Lo que no se pueda aplicar va a la **bandeja de conflictos** del gerente.

El POS externo **se mantiene** para cobrar con tarjeta; el sistema no lo reemplaza, lo concilia.

Roles de usuario: `ADMIN`, `GERENTE`, `CAJERO`, `MESERO`, `COCINA`.

Contexto completo (arquitectura, modelo de datos y fases): página de Notion "SISTEMA DE VENTAS".

### Fases

- **Fase 0 · Definición:** pantallas (mesero, cocina, caja, gerente) y preguntas pendientes.
- **Fase 1 · MVP en un centro piloto:** login, catálogo, pedidos con folio, pantalla de cocina, caja con número de autorización, apertura y cierre de turno, reporte de ventas por tipo.
- **Fase 2 · Conciliación y control:** importar el cierre del POS, reporte de diferencias, anulaciones con autorización y auditoría.
- **Fase 3 · Alta disponibilidad:** modo sin internet completo, HA en la base de datos, monitoreo y segundo centro.
- **Fase 4 · Crecimiento:** más centros, servidor local de contingencia, tableros, integración con el POS, factura electrónica (FEL) e inventario.

## Tecnologías

| Capa | Tecnología |
|---|---|
| App (frontend) | React + Vite + TypeScript, como PWA (app web instalable) |
| Diseño de pantallas | Tailwind CSS + shadcn/ui |
| Modo sin internet | IndexedDB (Dexie.js) + Service Worker (Workbox) + cola de sincronización |
| Login | Firebase Authentication (el rol y el centro viajan en el token) |
| API (backend) | Node.js + NestJS (TypeScript) |
| Acceso a datos | Prisma (o TypeORM) |
| Base de datos | PostgreSQL 16 en Cloud SQL con alta disponibilidad (esquema `ventas`, zona horaria `America/Guatemala`) |
| Tiempo real | Socket.IO (WebSockets) |
| Servidor de la API | Google Cloud Run (Docker) |
| Hosting de la app | Firebase Hosting |
| Archivos | Cloud Storage (fotos de vouchers, cierres del POS) |
| Publicación automática | GitHub + GitHub Actions |
| Monitoreo | Cloud Logging + Monitoring, Sentry |
| Reportes | Pantallas propias + Looker Studio |

## Estructura de carpetas

El proyecto está empezando. Esta es la estructura planificada; actualízala cuando cambie:

```
/
├── AGENTS.md            # Este archivo: contexto y reglas para los agentes
├── CLAUDE.md            # Apunta a AGENTS.md
├── frontend/            # App PWA (React + Vite + TypeScript)
│   └── src/
│       ├── pages/       # Pantallas: mesero, cocina, caja, gerente
│       ├── components/  # Componentes reutilizables (shadcn/ui)
│       ├── offline/     # IndexedDB (Dexie), cola de sincronización
│       └── services/    # Llamadas a la API y a Firebase
├── backend/             # API (NestJS)
│   ├── src/
│   │   └── modules/     # pedidos, pagos, turnos, catalogo, conciliacion, sync, usuarios
│   └── prisma/          # Esquema y migraciones
├── database/            # Scripts SQL: DDL (crear tablas) y DML (datos de ejemplo)
└── .github/workflows/   # GitHub Actions (pruebas y publicación)
```

### Tablas principales de la base de datos (v0.2)

- **Organización:** `centro_venta`, `usuario`, `usuario_centro`, `dispositivo`
- **Catálogo:** `categoria`, `producto`, `producto_centro`, `tipo_venta`, `metodo_pago`
- **Ventas:** `turno_caja`, `folio_contador`, `pedido`, `pedido_detalle`, `pago`
- **Control:** `pos_transaccion` (cierre del POS), `sync_conflicto` (bandeja de conflictos), `auditoria`
- **Funciones clave:** `siguiente_folio`, `validar_pago`, `recalcular_total_pedido`, `sync_pedido`, `sync_pago`, `registrar_conflicto`

## Reglas de negocio importantes

- El ID de cada pedido, línea y pago es un **UUID creado en el dispositivo**: reenviar no debe duplicar nada.
- Las validaciones contra cobros duplicados se repiten en la API **y** en la base de datos (índices únicos y triggers). No las quites.
- Solo puede haber **un turno de caja abierto por centro**.
- El pedido guarda la **hora real del dispositivo**, no la hora en que llegó a la nube.
- La sincronización envía todo **en orden** (el pedido antes que su pago).
