-- =====================================================================
-- Tarea 16 · Seguridad por centro de venta (Row Level Security)
-- Autorizado por el usuario el 2026-11-15. Repetible y sin borrar datos.
--
-- Cómo funciona:
--  · La API se conecta con su usuario de siempre y, en cada petición de un
--    usuario, cambia al rol limitado ventas_api (SET ROLE) e indica:
--      app.usuario_id = id del usuario   (lo usa la auditoría)
--      app.centros    = '1,2'            (centros autorizados del usuario)
--  · Para ventas_api, la base solo deja ver y cambiar pedidos, productos del
--    pedido, pagos, turnos, movimientos, solicitudes, cierres del POS,
--    dispositivos y conflictos de los centros indicados. Sin centros, no ve nada.
--  · El dueño de las tablas (scripts de carga y mantenimiento) no se ve afectado.
-- =====================================================================
SET search_path TO ventas;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ventas_api') THEN
    CREATE ROLE ventas_api NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
-- El usuario con el que se conecta la API debe poder cambiar a ventas_api.
GRANT ventas_api TO CURRENT_USER;

GRANT USAGE ON SCHEMA ventas TO ventas_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ventas TO ventas_api;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ventas TO ventas_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ventas TO ventas_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA ventas GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ventas_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA ventas GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ventas_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA ventas GRANT EXECUTE ON FUNCTIONS TO ventas_api;

-- Centros que indicó la API para esta conexión (vacío = ninguno).
CREATE OR REPLACE FUNCTION centros_permitidos() RETURNS SMALLINT[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(string_to_array(NULLIF(current_setting('app.centros', true), ''), ',')::SMALLINT[], '{}'::SMALLINT[])
$$;
GRANT EXECUTE ON FUNCTION centros_permitidos() TO ventas_api;

-- Tablas con centro_venta_id propio
ALTER TABLE pedido ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_pedido_centro ON pedido;
CREATE POLICY pol_pedido_centro ON pedido TO ventas_api
  USING (centro_venta_id = ANY (centros_permitidos()));

ALTER TABLE turno_caja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_turno_centro ON turno_caja;
CREATE POLICY pol_turno_centro ON turno_caja TO ventas_api
  USING (centro_venta_id = ANY (centros_permitidos()));

ALTER TABLE solicitud_autorizacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_solicitud_centro ON solicitud_autorizacion;
CREATE POLICY pol_solicitud_centro ON solicitud_autorizacion TO ventas_api
  USING (centro_venta_id = ANY (centros_permitidos()));

ALTER TABLE pos_transaccion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_pos_centro ON pos_transaccion;
CREATE POLICY pol_pos_centro ON pos_transaccion TO ventas_api
  USING (centro_venta_id = ANY (centros_permitidos()));

ALTER TABLE dispositivo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_dispositivo_centro ON dispositivo;
CREATE POLICY pol_dispositivo_centro ON dispositivo TO ventas_api
  USING (centro_venta_id = ANY (centros_permitidos()));

ALTER TABLE sync_conflicto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_conflicto_centro ON sync_conflicto;
CREATE POLICY pol_conflicto_centro ON sync_conflicto TO ventas_api
  USING (centro_venta_id = ANY (centros_permitidos()));

-- Tablas que dependen de un pedido o de un turno (heredan su centro)
ALTER TABLE pedido_detalle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_detalle_centro ON pedido_detalle;
CREATE POLICY pol_detalle_centro ON pedido_detalle TO ventas_api
  USING (EXISTS (SELECT 1 FROM pedido p WHERE p.id = pedido_detalle.pedido_id));

ALTER TABLE pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_pago_centro ON pago;
CREATE POLICY pol_pago_centro ON pago TO ventas_api
  USING (EXISTS (SELECT 1 FROM pedido p WHERE p.id = pago.pedido_id));

ALTER TABLE movimiento_caja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_movimiento_centro ON movimiento_caja;
CREATE POLICY pol_movimiento_centro ON movimiento_caja TO ventas_api
  USING (EXISTS (SELECT 1 FROM turno_caja t WHERE t.id = movimiento_caja.turno_id));
