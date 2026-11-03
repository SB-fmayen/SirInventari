# Dependencias: avance de R2 antes de publicar

Revisado el 2026-11-02. Este avance no aprueba la publicación.

- API: retirado `@nestjs/mau`, herramienta de NestJS sin referencias en código ni scripts. Su árbol incluía `tmp` y `undici` con avisos altos. Se eliminaron 41 paquetes.
- App: override limitado a `@firebase/firestore` para usar `@grpc/grpc-js` 1.13.6, versión corregida según https://github.com/advisories/GHSA-m9gg-hp2v-232j. Firebase fija originalmente la rama 1.9; el override conserva Firebase 13 y debe revisarse al actualizar ese SDK. La app solo importa `firebase/app` y `firebase/auth`; no usa Firestore ni su servidor gRPC. Las pruebas con Firebase simulado no validan Firestore real.
- No se aplicaron degradaciones mayores ni `npm audit fix --force`. El intento compatible de `npm audit fix --ignore-scripts` en API no corrigió los avisos restantes.

Resultado de auditoría: API, 7 moderados (6 al excluir desarrollo); app, 11 moderados y 3 bajos. Cero altos o críticos en ambas. Siguen pendientes las cadenas de glob/minimatch, las herramientas de shadcn y Workbox/deepmerge; hay que evaluar sus actualizaciones por separado antes de publicar. No forzar versiones mayores de estas dependencias transitivas sin comprobar sus consumidores.

Verificación: 14 pruebas unitarias de API y 53 de app correctas. Build y lint de ambas correctos, con los 5 avisos previos de lint web y el aviso previo de tamaño de paquete. Se genera el Service Worker de producción.

Las 72 pruebas de integración no se pudieron validar: `DATABASE_URL` apunta a localhost:5432 y no hay servidor escuchando allí, incluso fuera del entorno restringido. Existe PostgreSQL en 5433, pero rechaza las credenciales configuradas. La comprobación en ese puerto usó una variable temporal del proceso; no se modificó `.env`, ninguna contraseña ni el esquema. Restaurar la base de desarrollo prevista y repetir `npm run test:e2e` antes de dar este avance por completamente validado.

Actualización posterior del 2026-11-02: conexión recuperada al iniciar Docker Desktop, que estaba detenido y fuera del PATH de la sesión. El contenedor original volvió a escuchar en 5432 con las mismas credenciales y sus datos existentes; las 72 pruebas de integración pasan. También se repitieron las 14 unitarias de API y las 54 web actuales, todas correctas. Los avisos moderados/bajos indicados arriba siguen pendientes; esta recuperación no cierra por sí sola R2. Guía y comando de arranque en `docs/base-local.md`.
