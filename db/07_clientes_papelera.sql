-- Autorizado por el usuario el 2026-11-08. Aplicar dentro de una transacción.
SET search_path TO ventas, public;
CREATE TABLE cliente (
  id UUID PRIMARY KEY,
  centro_venta_id SMALLINT NOT NULL REFERENCES centro_venta(id),
  nombre VARCHAR(100) NOT NULL CHECK (length(trim(nombre)) > 0),
  telefono VARCHAR(30) NOT NULL,
  telefono_normalizado VARCHAR(30) NOT NULL CHECK (telefono_normalizado ~ '^[0-9]{6,15}$'),
  direccion VARCHAR(300),
  creado_por INT NOT NULL REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por INT NOT NULL REFERENCES usuario(id),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INT NOT NULL DEFAULT 1,
  eliminado_por INT REFERENCES usuario(id),
  eliminado_en TIMESTAMPTZ,
  motivo_eliminacion VARCHAR(300),
  UNIQUE (centro_venta_id, telefono_normalizado),
  UNIQUE (id, centro_venta_id),
  CONSTRAINT ck_cliente_papelera CHECK (
    (eliminado_en IS NULL AND eliminado_por IS NULL AND motivo_eliminacion IS NULL) OR
    (eliminado_en IS NOT NULL AND eliminado_por IS NOT NULL AND length(trim(motivo_eliminacion)) > 0 AND motivo_eliminacion IS NOT NULL))
);
CREATE TABLE cliente_cambio (
  id BIGSERIAL PRIMARY KEY,
  cliente_id UUID NOT NULL,
  centro_venta_id SMALLINT NOT NULL,
  operacion VARCHAR(20) NOT NULL CHECK (operacion IN ('CREACION','EDICION','ELIMINACION','RESTAURACION')),
  campo VARCHAR(30) NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  usuario_id INT NOT NULL REFERENCES usuario(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (cliente_id, centro_venta_id) REFERENCES cliente(id, centro_venta_id)
);
CREATE INDEX ix_cliente_cambio ON cliente_cambio(cliente_id, fecha, id);
ALTER TABLE pedido ADD COLUMN cliente_id UUID,
  ADD COLUMN cliente_telefono VARCHAR(30), ADD COLUMN cliente_direccion VARCHAR(300),
  ADD COLUMN eliminado_por INT REFERENCES usuario(id), ADD COLUMN eliminado_en TIMESTAMPTZ,
  ADD COLUMN motivo_eliminacion VARCHAR(300),
  ADD CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id, centro_venta_id) REFERENCES cliente(id, centro_venta_id),
  ADD CONSTRAINT ck_pedido_papelera CHECK (
    (eliminado_en IS NULL AND eliminado_por IS NULL AND motivo_eliminacion IS NULL) OR
    (eliminado_en IS NOT NULL AND eliminado_por IS NOT NULL AND motivo_eliminacion IS NOT NULL AND length(trim(motivo_eliminacion)) > 0));
CREATE INDEX ix_pedido_cliente ON pedido(cliente_id, creado_en);
CREATE INDEX ix_pedido_papelera ON pedido(centro_venta_id, eliminado_en) WHERE eliminado_en IS NOT NULL;

-- La ficha y sus cambios se guardan siempre juntos, incluso fuera de la API.
CREATE FUNCTION registrar_cliente_cambio() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_campo TEXT; v_operacion TEXT; v_antes JSONB; v_despues JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Usa la papelera para eliminar un cliente conservando su historial.'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.centro_venta_id <> OLD.centro_venta_id) THEN
    RAISE EXCEPTION 'No se puede mover un cliente a otro centro.';
  END IF;
  IF TG_OP = 'INSERT' THEN v_operacion := 'CREACION'; v_antes := '{}'::jsonb;
  ELSE
    v_antes := to_jsonb(OLD);
    v_operacion := CASE WHEN OLD.eliminado_en IS NULL AND NEW.eliminado_en IS NOT NULL THEN 'ELIMINACION'
      WHEN OLD.eliminado_en IS NOT NULL AND NEW.eliminado_en IS NULL THEN 'RESTAURACION' ELSE 'EDICION' END;
  END IF;
  v_despues := to_jsonb(NEW);
  FOREACH v_campo IN ARRAY ARRAY['nombre','telefono','direccion','eliminado_en','motivo_eliminacion'] LOOP
    IF (v_antes->>v_campo) IS DISTINCT FROM (v_despues->>v_campo) THEN
      INSERT INTO cliente_cambio(cliente_id,centro_venta_id,operacion,campo,valor_anterior,valor_nuevo,usuario_id)
      VALUES (NEW.id,NEW.centro_venta_id,v_operacion,v_campo,v_antes->>v_campo,v_despues->>v_campo,NEW.actualizado_por);
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_cliente_cambio AFTER INSERT OR UPDATE OR DELETE ON cliente FOR EACH ROW EXECUTE FUNCTION registrar_cliente_cambio();
CREATE TRIGGER trg_aud_cliente AFTER INSERT OR UPDATE ON cliente FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE FUNCTION proteger_cliente_historial() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'El historial de clientes no se puede editar ni eliminar.'; END; $$;
CREATE TRIGGER trg_cliente_historial BEFORE UPDATE OR DELETE ON cliente_cambio FOR EACH ROW EXECUTE FUNCTION proteger_cliente_historial();

ALTER TABLE permiso_usuario DROP CONSTRAINT permiso_usuario_modulo_check;
ALTER TABLE permiso_usuario ADD CONSTRAINT permiso_usuario_modulo_check CHECK (modulo IN ('pedidos','cocina','caja','turnos','catalogo','reportes','usuarios','clientes','papelera'));
