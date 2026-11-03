import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { SesionProvider } from './sesion/SesionProvider.tsx'

// Registra el Service Worker para que la app se pueda instalar (PWA).
// El modo sin internet completo se construye en la Fase 3.
if (import.meta.env.PROD) registerSW({ immediate: true })
else if ('serviceWorker' in navigator) {
  // Pide el worker de retiro incluso si la pestaña se abrió con recarga forzada.
  void navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
    .then((registro) => registro?.update())
    .catch(() => console.warn('No se pudo actualizar el registro anterior de la app.'))
}

const router = createBrowserRouter([{ path: '*', element: <SesionProvider><App /></SesionProvider> }])
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
