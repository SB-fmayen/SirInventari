# Iniciar PostgreSQL local

La base de SirInventari pertenece al contenedor `sirinventari-db` de Docker Compose. Su volumen conserva usuarios, catálogo y ventas entre reinicios. La instalación nativa de PostgreSQL en 5433 es otra instancia; no contiene el usuario `ventas_app` del proyecto.

Desde PowerShell, en la raíz del proyecto:

```powershell
.\scripts\iniciar-base-local.ps1
```

El comando encuentra Docker aunque no esté en PATH (instalación por usuario o general), inicia Docker Desktop si está detenido, levanta el servicio `db`, espera a que esté sano y comprueba la conexión real con `DATABASE_URL`. No imprime contraseñas ni cambia tablas o registros. Si es la primera ejecución en una máquina sin volumen previo, Compose crea la base y ejecuta los SQL iniciales según `docker-compose.yml`.

Para comprobar sin iniciar ni crear contenedores:

```powershell
.\scripts\iniciar-base-local.ps1 -SoloComprobar
```

La comprobación necesita las dependencias de `apps/api` instaladas. Lee `.env` directamente; no se deben enviar contraseñas por chat ni guardarlas en Git.

Después, abrir dos terminales para ejecutar `npm run start:dev` en `apps/api` y `npm run dev` en `apps/web`. Abrir http://localhost:5173 y comprobar http://localhost:3000/salud.

Para ejecutar las pruebas de integración, desde `apps/api`: `npm run test:e2e`. Se ejecutan en bases temporales aisladas y no limpian las ventas del desarrollo.

Para conservar los datos no usar `docker compose down -v`: esa opción elimina el volumen. Un reinicio normal no necesita reinstalar PostgreSQL ni restablecer sus contraseñas.

## Recuperación del 2026-11-02

Docker Desktop estaba instalado por usuario en `%LOCALAPPDATA%\Programs\DockerDesktop`, fuera del PATH de la sesión, y estaba detenido. Al ejecutar su comando `desktop start`, el contenedor existente arrancó automáticamente, sano, en 5432. Se conservó `.env` y no se modificaron contraseñas, esquema ni los datos existentes. La instalación nativa en 5433 se dejó funcionando como estaba.
