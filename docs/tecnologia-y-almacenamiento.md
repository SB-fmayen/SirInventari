# SirInventari: tecnología y almacenamiento de datos

Actualizado el 16 de noviembre de 2026.

## Respuesta breve

SirInventari está desarrollado con **React y TypeScript** para la aplicación y **NestJS sobre Node.js** para el servidor. Los datos del negocio se guardan en **PostgreSQL 16**. **Firebase Authentication** se utiliza para iniciar sesión con correo y contraseña.

Actualmente, la base principal funciona en la computadora local mediante **Docker Desktop**. La aplicación también guarda información en el navegador para recuperar borradores y trabajar sin conexión.

## Tecnologías utilizadas

| Parte del sistema | Tecnología | Para qué se utiliza |
| --- | --- | --- |
| Aplicación web | React, TypeScript y Vite | Pantallas de Ventas, Clientes, Cocina, Caja, Catálogo y Reportes. |
| Diseño | Tailwind CSS y componentes shadcn/ui | Estilos, formularios, botones y ventanas. |
| Servidor o API | NestJS y Node.js, con TypeScript | Validaciones, permisos y procesamiento de pedidos y cobros. |
| Base de datos principal | PostgreSQL 16 | Almacenamiento permanente de la información del negocio. |
| Acceso a la base | Prisma | Comunicación entre la API y PostgreSQL. |
| Inicio de sesión | Firebase Authentication | Identificación del usuario con correo y contraseña. |
| Actualizaciones en tiempo real | Socket.IO | Comunicación de cambios entre las pantallas. |
| Datos sin conexión | IndexedDB con Dexie | Copias locales y cola de operaciones pendientes de sincronizar. |
| Aplicación instalable | PWA y Service Worker | Instalación desde el navegador y almacenamiento de archivos de la app. |

## Dónde se guardan los datos

### 1. Información principal del negocio

En PostgreSQL, dentro de la base **`sistema_ventas`**, en el esquema **`ventas`**. Allí se guardan los pedidos, productos, clientes, pagos, turnos, centros de venta, roles, permisos e historiales de cambios.

En el entorno local, PostgreSQL se ejecuta en el contenedor **`sirinventari-db`**. Sus archivos están en un volumen persistente de Docker configurado como **`datos_db`**. Apagar la app o detener el contenedor conserva esa información. Los respaldos locales generados por las tareas del proyecto se guardan en la carpeta privada `logs/`.

### 2. Identidad y acceso de los usuarios

Firebase Authentication administra las cuentas de inicio de sesión. PostgreSQL conserva el identificador de Firebase asociado a cada usuario, su rol, sus permisos y sus centros autorizados. Las contraseñas de acceso se administran mediante Firebase Authentication.

### 3. Información guardada en cada navegador

- **IndexedDB:** copias de datos para trabajar sin conexión y operaciones pendientes de sincronizar, en una base local llamada `sirinventari`.
- **localStorage:** borradores de pedidos y preferencias de ese navegador.
- **Caché del Service Worker:** archivos necesarios para abrir la aplicación.

Esta información pertenece al navegador y dispositivo usados. Las operaciones pendientes quedan incorporadas a PostgreSQL cuando se sincronizan correctamente con la API.

## Publicación prevista

El plan de publicación contempla **Firebase Hosting** para la app, **Google Cloud Run** para la API y **Cloud SQL con PostgreSQL** para la base principal. El despliegue está pospuesto; esta descripción distingue el entorno local actual del alojamiento previsto.
