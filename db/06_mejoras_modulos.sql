-- Aprobado por el usuario: mejoras por módulo. Repetible, sin borrar ventas.
SET search_path TO ventas;
ALTER TABLE turno_caja ADD COLUMN IF NOT EXISTS motivo_diferencia VARCHAR(300);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS motivo_cortesia VARCHAR(300);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS cortesia_por INT REFERENCES usuario(id);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS cortesia_en TIMESTAMPTZ;
ALTER TABLE producto ADD COLUMN IF NOT EXISTS grupo_variantes VARCHAR(120);
ALTER TABLE producto ADD COLUMN IF NOT EXISTS es_complemento BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE producto ADD COLUMN IF NOT EXISTS foto_datos TEXT
  CONSTRAINT ck_producto_foto CHECK (foto_datos IS NULL OR (length(foto_datos) <= 280000 AND foto_datos ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));

CREATE TABLE IF NOT EXISTS movimiento_caja (
  id UUID PRIMARY KEY,
  turno_id INT NOT NULL REFERENCES turno_caja(id),
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('INGRESO','RETIRO')),
  monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  motivo VARCHAR(300) NOT NULL CHECK (length(trim(motivo)) > 0),
  registrado_por INT NOT NULL REFERENCES usuario(id),
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS permiso_usuario (
  usuario_id INT NOT NULL REFERENCES usuario(id),
  modulo VARCHAR(20) NOT NULL CHECK (modulo IN ('pedidos','cocina','caja','turnos','catalogo','reportes','usuarios')),
  accion VARCHAR(20) NOT NULL CHECK (accion IN ('ver','crear','editar','anular','autorizar')),
  permitido BOOLEAN NOT NULL,
  PRIMARY KEY (usuario_id, modulo, accion)
);
CREATE TABLE IF NOT EXISTS solicitud_autorizacion (
  id UUID PRIMARY KEY,
  centro_venta_id SMALLINT NOT NULL REFERENCES centro_venta(id),
  pedido_id UUID NOT NULL REFERENCES pedido(id),
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('ANULAR_LINEA','ANULAR_PAGO','CORTESIA','RETROCEDER_COCINA')),
  referencia VARCHAR(50),
  version_pedido INT NOT NULL,
  motivo VARCHAR(300) NOT NULL CHECK (length(trim(motivo)) > 0),
  solicitado_por INT NOT NULL REFERENCES usuario(id),
  solicitado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA')),
  resuelto_por INT REFERENCES usuario(id),
  resuelto_en TIMESTAMPTZ,
  nota VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS ix_solicitud_centro ON solicitud_autorizacion(centro_venta_id, estado);
CREATE INDEX IF NOT EXISTS ix_movimiento_turno ON movimiento_caja(turno_id);

CREATE OR REPLACE FUNCTION validar_movimiento_caja() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_centro SMALLINT; v_estado estado_turno;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Los movimientos de caja no se editan ni eliminan. Registra una corrección con motivo.'; END IF;
  SELECT centro_venta_id, estado INTO v_centro, v_estado FROM turno_caja WHERE id=NEW.turno_id FOR UPDATE;
  IF v_estado IS DISTINCT FROM 'ABIERTO' THEN RAISE EXCEPTION 'El turno de caja ya está cerrado.'; END IF;
  IF NOT usuario_en_centro(NEW.registrado_por,v_centro) THEN RAISE EXCEPTION 'El usuario no tiene acceso a este centro.'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_movimiento_caja ON movimiento_caja;
CREATE TRIGGER trg_movimiento_caja BEFORE INSERT OR UPDATE OR DELETE ON movimiento_caja FOR EACH ROW EXECUTE FUNCTION validar_movimiento_caja();
DROP TRIGGER IF EXISTS trg_aud_movimiento ON movimiento_caja;
CREATE TRIGGER trg_aud_movimiento AFTER INSERT ON movimiento_caja FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
