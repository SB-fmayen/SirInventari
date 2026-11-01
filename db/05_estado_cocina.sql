-- Cambio autorizado por el usuario el 2026-11-01 (Tarea 9).
-- Bases nuevas: ya está incluido en 01_esquema_v0.3.sql.
-- Bases existentes: ejecutar una vez; repetirlo no reinicia la preparación.
BEGIN;
SET LOCAL search_path TO ventas, public;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'ventas' AND table_name = 'pedido' AND column_name = 'estado_cocina') THEN
    ALTER TABLE pedido ADD COLUMN estado_cocina VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
      CONSTRAINT ck_pedido_estado_cocina CHECK (estado_cocina IN ('PENDIENTE','EN_PREPARACION','LISTO','ENTREGADO'));
    -- Solo al incorporar el campo se conserva la preparación anterior conocida.
    UPDATE pedido SET estado_cocina = estado::text
      WHERE estado IN ('EN_PREPARACION','LISTO','ENTREGADO');
  END IF;
END $$;
COMMIT;
