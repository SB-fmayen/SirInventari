# App de SirInventari (PWA)

React + Vite + TypeScript + Tailwind CSS + shadcn/ui. Diseñada para tablet, con botones grandes.

## Comandos

| Comando | Para qué sirve |
|---|---|
| `npm install` | Instala las dependencias (la primera vez). |
| `npm run dev` | Abre la app en modo desarrollo en http://localhost:5173 |
| `npm run build` y `npm run preview` | Compila la versión final (con Service Worker) y la sirve para probarla. |
| `npm test` | Pruebas automáticas. |
| `npm run lint` | Revisa el código. |
| `npm run iconos` | Vuelve a generar los íconos de la PWA desde `public/logo.svg`. |

## Configuración

- La dirección de la API se toma de `VITE_API_URL` en el `.env` de la **raíz** del proyecto.
  Solo las variables que empiezan con `VITE_` llegan al navegador.
- La app consulta `GET /salud` al abrir y cada 30 segundos, y muestra arriba a la derecha
  si la API está conectada. Al tocar el indicador, revisa de nuevo.

## Estado

- Menú: Pedidos, Cocina, Caja, Turnos, Catálogo y Reportes (pantallas en construcción).
- PWA instalable. El modo sin internet completo se construye en la Fase 3 del plan.
