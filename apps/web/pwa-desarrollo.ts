import type { Plugin } from 'vite'

// Reemplaza el worker de una compilación anterior cuando se vuelve a usar Vite.
// Conserva cachés, sesión y datos locales; solo retira este registro y recarga sus pestañas.
export const RETIRAR_WORKER_DESARROLLO = `
self.addEventListener('install', (evento) => {
  evento.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    await self.registration.unregister();
    const ventanas = await self.clients.matchAll({ type: 'window' });
    await Promise.all(ventanas.map((ventana) => ventana.navigate(ventana.url)));
  })());
});
`

export function retirarPwaEnDesarrollo(): Plugin {
  return {
    name: 'retirar-pwa-en-desarrollo',
    apply: 'serve',
    configureServer(servidor) {
      servidor.middlewares.use((solicitud, respuesta, siguiente) => {
        if (solicitud.url?.split('?')[0] !== '/sw.js') return siguiente()
        respuesta.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        respuesta.end(RETIRAR_WORKER_DESARROLLO)
      })
    },
  }
}
