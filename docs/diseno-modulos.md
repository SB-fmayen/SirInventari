# Renovación de módulos solicitada el 2026-11-02

Referencia visual consultada: [bloques de navegación de shadcn/ui](https://ui.shadcn.com/blocks/sidebar). Se adaptó la idea al React/Vite y los componentes existentes, sin instalar plantillas ni cambiar las librerías.

- Menú lateral verde oscuro en pantallas desde 1280 px. En tablet y móvil se conserva la navegación horizontal desplazable y los controles grandes.
- Inicio con tarjetas de módulo, icono y acceso visible; solo aparecen los módulos autorizados al rol.
- Superficies, tablas, encabezados y estados de foco comunes a los módulos. Enlace de teclado para saltar al contenido.
- Toma de pedidos con búsqueda por nombre/SKU y categoría, menú desplazable y resumen de líneas con cantidades y notas. En pantalla grande se muestra menú y resumen en dos columnas; en tablet y móvil se apilan. Los UUID, reintentos, envío, centavos y anulaciones conservan el flujo existente.
- Usuarios muestra una tabla desplegable de permisos basada en el mismo mapa de navegación.

Prueba automática nueva: cambiar la búsqueda del menú no pierde cantidades ni notas, conserva el total y encuentra productos por SKU o nombre sin distinguir mayúsculas.

Pendiente de inspección visual con sesión real: el servicio de acceso al navegador no estuvo disponible durante este avance. No se declara una validación visual hecha. Revisar Inicio, los siete módulos y Nuevo pedido en escritorio, tablet y móvil; comprobar navegación, formularios, tablas, buscador, notas y guardado siguiendo también `docs/pruebas-manuales.md`.
