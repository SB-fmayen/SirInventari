# Mejoras aprobadas por el usuario

El usuario aprobó todas las propuestas I1–I3, P1–P5, C1–C4, CA1–CA5, T1–T4, CT1–CT5, R1–R5 y U1–U5, con autorización para implementarlas. Se aplican por bloques y se conserva el historial de ventas.

## Decisiones de operación

- Cerrar un turno con pedidos abiertos genera una advertencia y exige confirmarla; no obliga a cerrar las cuentas de otras mesas.
- Las diferencias de efectivo requieren motivo. Retiros e ingresos requieren monto positivo, motivo y turno abierto; no alteran las ventas reportadas.
- Cortesías y correcciones de cocina requieren gerente o administrador. Las cortesías finalizan pedidos sin pagos positivos, con motivo y auditoría; no se inventan pagos de cero.
- Las anulaciones de pagos son registros internos. Nunca ejecutan una devolución ni una anulación en el POS externo.
- La eliminación se limita a registros sin historial; usuarios con actividad y productos vendidos se desactivan. Eliminar de SirInventari no elimina automáticamente la cuenta de Firebase.
- Los permisos específicos restringen acciones dentro del alcance del rol; no conceden acceso a módulos o centros no autorizados. ADMIN conserva acceso para administrar el sistema.
- Fotos opcionales almacenadas localmente en la base como imágenes pequeñas; no se contratan servicios ni se crean recursos de pago.
- Borrador recuperable es una ayuda local; no se presenta como venta sin internet ni envía productos a Cocina hasta guardar.

## Seguimiento

En implementación. Cada bloque se verifica y se registra en ESTADO.md y Git. Las funciones futuras del plan (conciliación POS, modo sin internet completo e impresora) conservan sus requisitos y no se declaran terminadas por esta aprobación.
