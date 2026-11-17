# Publicación del piloto: propuesta para aprobar

Estado: archivos preparados, sin servicios creados, sin imágenes subidas y sin publicar. Antes de ejecutar pasos en Google Cloud se necesita la aprobación del usuario y su facturación activa. También falta terminar Cocina y resolver los pendientes de seguridad de R2 en ESTADO.md.

Actualización del 2026-11-17: el usuario reafirma que no se publique todavía. Se conserva esta propuesta para el futuro. GitHub recibe el código y ejecuta verificaciones; el despliegue está bloqueado explícitamente.

## 1. Plan y costo propuesto

Propuesta para **un centro piloto**, región `us-central1`, precios en USD consultados el 31 de octubre de 2026, sin impuestos ni conversión de moneda. Esta es una estimación propia con los supuestos siguientes, no una cotización ni un límite de cobro:

| Parte | Supuesto | Estimación mensual |
|---|---|---:|
| Cloud SQL | PostgreSQL 16, Enterprise, 1 vCPU y 3.75 GiB, 730 horas | USD 49.31 |
| Disco y respaldo | 10 GiB SSD y 10 GiB de respaldos usados | USD 2.50 |
| Cloud Run | 1 vCPU, 1 GiB, una instancia activa entre 360 y 730 horas, sin descontar cuota gratuita | USD 25.92–52.56 |
| Margen para otros consumos | Registro de imágenes, secretos, logs, tráfico y crecimiento pequeño | USD 5–20 |
| **Reserva propuesta** | Aproximadamente USD 83–125 con estos supuestos | **USD 130/mes antes de impuestos** |

Cloud SQL se calculó con USD 0.0413/vCPU-hora y USD 0.007/GiB-hora; disco equivale a USD 0.17/GiB-mes y respaldo usado a USD 0.08/GiB-mes. [Precios de Cloud SQL](https://cloud.google.com/sql/pricing).

Cloud Run se calculó a USD 0.000018/vCPU-segundo y USD 0.000002/GiB-segundo. Una conexión WebSocket abierta mantiene activa la instancia: no se debe estimar solo el tiempo de los clics. [Precios](https://cloud.google.com/run/pricing), [WebSockets y facturación](https://docs.cloud.google.com/run/docs/triggering/websockets).

Hosting tiene una cuota sin costo de transferencia de 10 GB/mes; revisar el consumo conjunto del proyecto. [Cuotas de Hosting](https://firebase.google.com/docs/hosting/usage-quotas-pricing).

Configurar alertas del presupuesto a 50 %, 80 % y 100 %. El presupuesto de USD 130 **no corta el gasto automáticamente**. Revisar consumos y aumentos de disco/transferencia. [Presupuestos de Google Cloud](https://docs.cloud.google.com/billing/docs/how-to/budgets).

El piloto propone una base zonal, sin alta disponibilidad todavía. HA, ampliación de instancias y su costo corresponden a la Tarea 21. No contratar compromisos de uno o tres años durante el piloto.

## 2. Lo que debe confirmar o configurar el usuario

1. Aprobar esta región, tamaño y reserva mensual, o indicar otro presupuesto.
2. Confirmar el proyecto Firebase/Google Cloud que se usará, con facturación activa, y los centros y usuarios reales del piloto.
3. Dar acceso administrativo para configurar IAM, Cloud SQL, Cloud Run, Secret Manager, Artifact Registry y Hosting, después de aprobar el costo.
4. Tener acceso al repositorio `SB-fmayen/SirInventari` y sus ajustes de GitHub Actions. No se ha hecho push desde esta sesión.
5. Configurar el secreto de CI y, más adelante, el entorno protegido de publicación descrito abajo.

No pegar contraseñas en código, mensajes, comandos con argumentos ni archivos que se suban a Git. Las contraseñas de base se guardan en Secret Manager; localmente se usan `.env` excluidos de Git.

## 3. Comprobar lo preparado sin publicar

En `apps/api`:

```powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run lint
```

En `apps/web`, ejecutar esos mismos comandos excepto `test:e2e`, que pertenece a la API.

El contenedor se construye desde la raíz cuando Docker esté disponible:

```powershell
docker build -f apps/api/Dockerfile -t sirinventari-api:piloto .
```

No hace falta una contraseña para construir: Prisma genera el cliente desde el esquema y no ejecuta migraciones. La imagen incluye solo el código compilado y dependencias de producción, corre como usuario `node` y recibe DATABASE_URL al arrancar. El contexto excluye `.env`, claves y credenciales de GitHub. No se ha podido ejecutar este build local: falta el comando `docker` en la sesión del agente. El flujo de CI también construye la imagen sin subirla.

## 4. Preparar Google Cloud solo después de la aprobación

Estos son pasos de consola revisables; no hay un script que cree servicios de pago al ejecutarse por accidente.

1. En el proyecto confirmado, habilitar Cloud SQL Admin, Cloud Run, Artifact Registry, Secret Manager e IAM Credentials. Confirmar Firebase Hosting y Authentication con correo/contraseña.
2. Crear Cloud SQL PostgreSQL 16 en `us-central1`, Enterprise de propósito general, 1 vCPU/3840 MiB, SSD de 10 GiB. Activar respaldos automáticos diarios con retención inicial de siete respaldos y definir una ventana fuera del horario de venta. Revisar crecimiento automático y su límite; una ampliación sube el costo. No habilitar HA sin el presupuesto de Tarea 21.
3. Crear una base nueva para ventas. Inicializarla con `db/01_esquema_v0.3.sql`, sin modificarlo. Cargar `db/03_catalogos_produccion.sql` para tipos de venta y métodos de pago. No cargar `02_datos_iniciales.sql` en producción: contiene usuarios, productos y un turno de ejemplo.
4. Cargar los centros reales confirmados y el primer ADMIN. El script `apps/api/scripts/crear-admin.ts` registra en la base un UID real ya creado en Firebase; ejecutarlo con la conexión de administración en un `.env` local fuera del seguimiento de Git. No copiar usuarios con UID ficticio de las pruebas.
5. Crear un usuario de base para la API, diferente del administrador. Dar USAGE en esquema `ventas`, SELECT/INSERT/UPDATE/DELETE en sus tablas, USAGE/SELECT en secuencias y EXECUTE en sus funciones. No darle permisos para crear bases ni cambiar el esquema. Los triggers siguen protegiendo pagos y pedidos.
6. Crear en Secret Manager el secreto de DATABASE_URL. Para el montaje de Cloud SQL en Cloud Run, usar una URL PostgreSQL con contraseña codificada como URL y `host=/cloudsql/PROYECTO:REGION:INSTANCIA`. Guardar el valor desde un archivo privado local o la consola; no incluirlo en argumentos, logs ni Git. Registrar el número de versión para fijarlo en cada publicación.
7. Crear un repositorio Docker en Artifact Registry de la misma región.
8. Crear dos cuentas de servicio separadas: ejecución de API y publicación. No descargar claves JSON privadas para Cloud Run ni GitHub.

## 5. Identidad y permisos

La cuenta de **ejecución** necesita Cloud SQL Client, acceso solo al secreto de conexión y Firebase Authentication Admin para crear/desactivar usuarios y revisar revocaciones. La API usa `FIREBASE_USAR_ADC=true` y las credenciales predeterminadas de su identidad de Cloud Run. En desarrollo sigue funcionando `GOOGLE_APPLICATION_CREDENTIALS` con el JSON privado fuera del proyecto.

La cuenta de **publicación** necesita permisos para subir imágenes al repositorio concreto, administrar el servicio Cloud Run, usar la cuenta de ejecución y publicar Hosting. Restringir sus permisos al proyecto y recursos del piloto; no usar Owner.

Configurar Workload Identity Federation para GitHub, restringido al repositorio `SB-fmayen/SirInventari`, rama `main` y entorno `produccion`. Revisar también identificadores de propietario/repositorio para evitar confiar en otro repositorio con nombre parecido. [Autenticación mediante identidad federada](https://github.com/google-github-actions/auth).

Firebase CLI usa credenciales predeterminadas en CI; no hace falta un token de usuario de larga duración. [Referencia de Firebase CLI](https://firebase.google.com/docs/cli#cli-ci-systems).

## 6. GitHub Actions: pruebas primero, publicación desactivada

El archivo `.github/workflows/verificar-y-publicar.yml`, mostrado como **Verificar SirInventari**, prueba API y app en push a `main` y pull requests. Usa PostgreSQL 16 temporal y bases de prueba aisladas. El contenedor se construye, pero no se sube durante las comprobaciones.

Configurar `CI_DB_PASSWORD` como secreto del repositorio, con una contraseña aleatoria hexadecimal exclusiva para el contenedor efímero de CI. No es la contraseña de producción. Los pull requests de forks no reciben secretos: su prueba de API requiere una ejecución autorizada del mantenedor.

La etapa **Publicación desactivada** está bloqueada con `if: ${{ false }}`; configurar `PUBLICAR_APROBADO=true` no la activa. Solo después de una nueva autorización expresa del usuario se podrá restaurar la condición `github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.PUBLICAR_APROBADO == 'true'`, resolver los pendientes del plan y configurar el entorno `produccion` con revisores requeridos y acceso solo desde `main`. Mantener la variable ausente o `false` mientras el despliegue esté pospuesto.

Variables de ese entorno:

| Variable | Contenido |
|---|---|
| `GCP_PROJECT_ID` | Proyecto Google Cloud confirmado |
| `GCP_REGION` | Región aprobada, propuesta `us-central1` |
| `ARTIFACT_REPOSITORY` | Nombre del repositorio Docker |
| `CLOUD_SQL_CONNECTION` | `proyecto:region:instancia` |
| `RUNTIME_SERVICE_ACCOUNT` | Correo de la identidad de ejecución |
| `DEPLOY_SERVICE_ACCOUNT` | Correo de la identidad de publicación |
| `WIF_PROVIDER` | Ruta del proveedor de identidad federada |
| `DATABASE_SECRET` | Nombre del secreto de conexión, sin el valor |
| `DATABASE_SECRET_VERSION` | Versión numérica, no `latest` |
| `FIREBASE_PROJECT_ID` | Proyecto Firebase confirmado |
| `CORS_ORIGENES` | URLs HTTPS de Hosting permitidas, separadas por coma |
| `FIREBASE_AUTH_DOMAIN` | Dominio de Authentication |
| `FIREBASE_APP_ID` | ID de la app web registrada |
| `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_STORAGE_BUCKET` | Configuración web existente si corresponde |

Configurar también `FIREBASE_WEB_API_KEY` como secreto del entorno. Es la configuración web del SDK, no una clave privada de cuenta de servicio. La URL de la API se obtiene del servicio desplegado y se usa al compilar Vite.

La API se publica con máximo **una instancia**, mínimo cero, 1 CPU y 1 GiB, afinidad de sesión y tiempo de espera de 60 minutos. Socket.IO reconecta y recarga al vencer una conexión. No subir el máximo sin un adaptador de difusión entre instancias y pruebas entre réplicas; hoy los avisos son locales a la instancia.

El flujo no ejecuta migraciones ni importa SQL sobre una base existente. Comprueba `/salud` antes de publicar la app en Hosting.

## 7. Comprobación y recuperación después de publicar

1. Revisar `/salud`: API y base correctas, fecha de Guatemala.
2. Entrar en la URL de Hosting con ADMIN real; recargar; probar roles/centros.
3. Completar un pedido de prueba autorizado: turno, cocina, cobro con voucher de prueba y reporte. No declarar terminada Tarea 13 hasta que funcione el recorrido completo.
4. Verificar que la última copia de Cloud SQL existe y probar una restauración en una base separada antes de usar ventas reales. No restaurar encima de producción para comprobarla.
5. Para revertir una publicación, volver a la revisión anterior de Cloud Run y a la versión anterior de Hosting. La versión de secreto fijada y la imagen etiquetada por commit facilitan identificar lo publicado. No borrar ni retroceder datos de ventas para revertir código.
6. Revisar presupuesto, consumo de disco, conexiones y logs tras el primer día y la primera semana.

No se han ejecutado IAM, creación de infraestructura, push, publicación, restauraciones ni cobros reales en esta preparación.
