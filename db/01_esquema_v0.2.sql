-- =====================================================================
-- SISTEMA DE VENTAS  ·  Esquema PostgreSQL 16  ·  v0.2
-- Nube + modo sin internet · por centros de venta · anti-duplicado
-- v0.2: dispositivos, folio provisional sin internet, origen del registro,
--       bandeja de conflictos y funciones de sincronización idempotentes
-- =====================================================================
-- La "fecha de operación" debe calcularse con la hora de Guatemala, no UTC
-- ALTER DATABASE sistema_ventas SET timezone TO 'America/Guatemala';

CREATE SCHEMA IF NOT EXISTS ventas;
SET search_path TO ventas;

-- ---------- Tipos de dominio ----------
CREATE TYPE rol_usuario         AS ENUM ('ADMIN','GERENTE','CAJERO','MESERO','COCINA');
CREATE TYPE estado_pedido       AS ENUM ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO','PAGADO','ANULADO');
CREATE TYPE estado_linea        AS ENUM ('ACTIVA','ANULADA');
CREATE TYPE estado_pago         AS ENUM ('APLICADO','ANULADO');
CREATE TYPE estado_turno        AS ENUM ('ABIERTO','CERRADO');
CREATE TYPE estado_conciliacion AS ENUM ('PENDIENTE','CONCILIADO','SIN_PEDIDO','DIFERENCIA_MONTO','DUPLICADO');
CREATE TYPE origen_registro     AS ENUM ('EN_LINEA','SIN_INTERNET','MANUAL');   -- MANUAL = talonario de emergencia digitado después
CREATE TYPE tipo_dispositivo    AS ENUM ('CAJA','TABLET','COCINA','GERENCIA');
CREATE TYPE estado_conflicto    AS ENUM ('PENDIENTE','RESUELTO','DESCARTADO');

-- ---------- Organización ----------
CREATE TABLE centro_venta (
  id          SMALLSERIAL  PRIMARY KEY,
  codigo      VARCHAR(10)  NOT NULL UNIQUE,
  nombre      VARCHAR(100) NOT NULL,
  direccion   VARCHAR(200),
  telefono    VARCHAR(20),
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE usuario (
  id            SERIAL       PRIMARY KEY,
  firebase_uid  VARCHAR(128) NOT NULL UNIQUE,   -- enlace con Firebase Authentication
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  rol           rol_usuario  NOT NULL,
  activo        BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE usuario_centro (                  -- un usuario puede trabajar en varios centros
  usuario_id      INT      NOT NULL REFERENCES usuario(id),
  centro_venta_id SMALLINT NOT NULL REFERENCES centro_venta(id),
  PRIMARY KEY (usuario_id, centro_venta_id)
);

CREATE TABLE dispositivo (                     -- cada tablet / caja registrada en un centro
  id                    SERIAL           PRIMARY KEY,
  centro_venta_id       SMALLINT         NOT NULL REFERENCES centro_venta(id),
  codigo                VARCHAR(10)      NOT NULL UNIQUE,   -- ej. CAJA1: sale en el folio provisional
  nombre                VARCHAR(60)      NOT NULL,
  tipo                  tipo_dispositivo NOT NULL,
  activo                BOOLEAN          NOT NULL DEFAULT TRUE,  -- si se pierde, el gerente lo desactiva
  registrado_en         TIMESTAMPTZ      NOT NULL DEFAULT now(),
  ultima_sincronizacion TIMESTAMPTZ                              -- para alertar "no sincroniza hace X min"
);

-- ---------- Catálogo ----------
CREATE TABLE categoria (
  id      SERIAL      PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE,
  orden   SMALLINT    NOT NULL DEFAULT 0,
  activo  BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE producto (
  id           SERIAL        PRIMARY KEY,
  categoria_id INT           NOT NULL REFERENCES categoria(id),
  sku          VARCHAR(30)   NOT NULL UNIQUE,
  nombre       VARCHAR(120)  NOT NULL,
  precio_base  NUMERIC(10,2) NOT NULL CHECK (precio_base >= 0),
  activo       BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE producto_centro (                 -- precio y disponibilidad por centro
  producto_id     INT           NOT NULL REFERENCES producto(id),
  centro_venta_id SMALLINT      NOT NULL REFERENCES centro_venta(id),
  precio          NUMERIC(10,2) CHECK (precio >= 0),   -- NULL = usa precio_base
  disponible      BOOLEAN       NOT NULL DEFAULT TRUE,
  PRIMARY KEY (producto_id, centro_venta_id)
);

-- ---------- Catálogos de venta y cobro ----------
CREATE TABLE tipo_venta (
  id      SMALLSERIAL PRIMARY KEY,
  codigo  VARCHAR(15) NOT NULL UNIQUE,
  nombre  VARCHAR(50) NOT NULL
);

CREATE TABLE metodo_pago (
  id                  SMALLSERIAL PRIMARY KEY,
  codigo              VARCHAR(15) NOT NULL UNIQUE,
  nombre              VARCHAR(50) NOT NULL,
  requiere_referencia BOOLEAN     NOT NULL DEFAULT FALSE   -- TRUE para tarjeta/transferencia
);

CREATE TABLE turno_caja (
  id               SERIAL        PRIMARY KEY,
  centro_venta_id  SMALLINT      NOT NULL REFERENCES centro_venta(id),
  fecha_operacion  DATE          NOT NULL DEFAULT CURRENT_DATE,
  abierto_por      INT           NOT NULL REFERENCES usuario(id),
  abierto_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  fondo_inicial    NUMERIC(10,2) NOT NULL DEFAULT 0,
  cerrado_por      INT           REFERENCES usuario(id),
  cerrado_en       TIMESTAMPTZ,
  efectivo_contado NUMERIC(10,2),
  estado           estado_turno  NOT NULL DEFAULT 'ABIERTO'
);
-- Solo puede haber UN turno abierto por centro de venta
CREATE UNIQUE INDEX uq_turno_abierto ON turno_caja(centro_venta_id) WHERE estado = 'ABIERTO';

-- ---------- Ventas ----------
CREATE TABLE folio_contador (                  -- folio correlativo por centro y día
  centro_venta_id SMALLINT NOT NULL REFERENCES centro_venta(id),
  fecha_operacion DATE     NOT NULL,
  ultimo_folio    INT      NOT NULL DEFAULT 0,
  PRIMARY KEY (centro_venta_id, fecha_operacion)
);

CREATE TABLE pedido (
  id              UUID          PRIMARY KEY,     -- lo genera el dispositivo (evita duplicados al reenviar)
  centro_venta_id SMALLINT      NOT NULL REFERENCES centro_venta(id),
  fecha_operacion DATE          NOT NULL DEFAULT CURRENT_DATE,
  folio           INT           NOT NULL,        -- lo asigna el servidor al recibir el pedido
  tipo_venta_id   SMALLINT      NOT NULL REFERENCES tipo_venta(id),
  turno_id        INT           REFERENCES turno_caja(id),
  mesa_referencia VARCHAR(30),
  cliente_nombre  VARCHAR(100),
  estado          estado_pedido NOT NULL DEFAULT 'ABIERTO',
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  total           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  creado_por      INT           NOT NULL REFERENCES usuario(id),
  creado_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),   -- hora real en que se tomó (la del dispositivo)
  actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  version         INT           NOT NULL DEFAULT 1,   -- control de concurrencia optimista
  -- Modo sin internet
  dispositivo_id  INT             REFERENCES dispositivo(id),
  origen          origen_registro NOT NULL DEFAULT 'EN_LINEA',
  folio_offline   VARCHAR(20)     UNIQUE,              -- folio provisional impreso, ej. CAJA1-0007
  sincronizado_en TIMESTAMPTZ     NOT NULL DEFAULT now(),  -- cuándo llegó a la nube
  UNIQUE (centro_venta_id, fecha_operacion, folio),
  CHECK (origen = 'EN_LINEA' OR folio_offline IS NOT NULL)
);
CREATE INDEX ix_pedido_centro_fecha ON pedido(centro_venta_id, fecha_operacion, estado);

CREATE TABLE pedido_detalle (
  id               UUID          PRIMARY KEY,    -- generado en el dispositivo
  pedido_id        UUID          NOT NULL REFERENCES pedido(id),
  producto_id      INT           NOT NULL REFERENCES producto(id),
  cantidad         NUMERIC(8,2)  NOT NULL CHECK (cantidad > 0),
  precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
  importe          NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  notas            VARCHAR(200),
  estado           estado_linea  NOT NULL DEFAULT 'ACTIVA',
  agregado_por     INT           NOT NULL REFERENCES usuario(id),  -- quién agregó el producto
  agregado_en      TIMESTAMPTZ   NOT NULL DEFAULT now(),           -- y a qué hora
  anulado_por      INT           REFERENCES usuario(id),
  anulado_en       TIMESTAMPTZ,
  motivo_anulacion VARCHAR(200),
  origen           origen_registro NOT NULL DEFAULT 'EN_LINEA',
  CHECK (estado = 'ACTIVA' OR (anulado_por IS NOT NULL AND motivo_anulacion IS NOT NULL))
);
CREATE INDEX ix_detalle_pedido ON pedido_detalle(pedido_id);

-- ---------- Cobros y conciliación ----------
CREATE TABLE pago (
  id               UUID          PRIMARY KEY,
  pedido_id        UUID          NOT NULL REFERENCES pedido(id),
  metodo_pago_id   SMALLINT      NOT NULL REFERENCES metodo_pago(id),
  turno_id         INT           NOT NULL REFERENCES turno_caja(id),
  fecha_operacion  DATE          NOT NULL DEFAULT CURRENT_DATE,
  monto            NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  terminal_pos     VARCHAR(30),                 -- terminal del POS externo
  referencia_pos   VARCHAR(40),                 -- nº de autorización del voucher
  estado           estado_pago   NOT NULL DEFAULT 'APLICADO',
  registrado_por   INT           NOT NULL REFERENCES usuario(id),
  registrado_en    TIMESTAMPTZ   NOT NULL DEFAULT now(),   -- hora real del cobro (la del dispositivo)
  anulado_por      INT           REFERENCES usuario(id),
  motivo_anulacion VARCHAR(200),
  dispositivo_id   INT             REFERENCES dispositivo(id),
  origen           origen_registro NOT NULL DEFAULT 'EN_LINEA',
  sincronizado_en  TIMESTAMPTZ     NOT NULL DEFAULT now()
);
-- Un mismo voucher del POS NO puede registrarse dos veces
CREATE UNIQUE INDEX uq_pago_voucher ON pago(terminal_pos, fecha_operacion, referencia_pos)
  WHERE referencia_pos IS NOT NULL AND estado = 'APLICADO';
CREATE INDEX ix_pago_pedido ON pago(pedido_id);

CREATE TABLE pos_transaccion (                 -- lo que reporta el cierre del POS (importado)
  id                  BIGSERIAL     PRIMARY KEY,
  centro_venta_id     SMALLINT      NOT NULL REFERENCES centro_venta(id),
  fecha_operacion     DATE          NOT NULL,
  fecha_hora          TIMESTAMPTZ,
  terminal_pos        VARCHAR(30)   NOT NULL,
  referencia_pos      VARCHAR(40)   NOT NULL,
  monto               NUMERIC(12,2) NOT NULL,
  ultimos4            CHAR(4),
  archivo_origen      VARCHAR(200),
  pago_id             UUID          REFERENCES pago(id),
  estado_conciliacion estado_conciliacion NOT NULL DEFAULT 'PENDIENTE',
  importado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (terminal_pos, fecha_operacion, referencia_pos)
);

-- ---------- Sincronización: bandeja de conflictos ----------
-- Lo que llegó de un dispositivo y NO se pudo aplicar (ej. el pedido ya estaba
-- pagado o el voucher ya se usó). Nada se pierde: queda aquí para que el gerente decida.
CREATE TABLE sync_conflicto (
  id              BIGSERIAL        PRIMARY KEY,
  centro_venta_id SMALLINT         NOT NULL REFERENCES centro_venta(id),
  dispositivo_id  INT              NOT NULL REFERENCES dispositivo(id),
  tipo_operacion  VARCHAR(20)      NOT NULL CHECK (tipo_operacion IN ('PEDIDO','LINEA','PAGO')),
  operacion_id    UUID             NOT NULL UNIQUE,   -- reenviar el mismo conflicto no lo duplica
  datos           JSONB            NOT NULL,          -- lo que mandó el dispositivo, completo
  motivo          TEXT             NOT NULL,          -- por qué no se aplicó
  estado          estado_conflicto NOT NULL DEFAULT 'PENDIENTE',
  recibido_en     TIMESTAMPTZ      NOT NULL DEFAULT now(),
  resuelto_por    INT              REFERENCES usuario(id),
  resuelto_en     TIMESTAMPTZ,
  nota_resolucion VARCHAR(300)
);
CREATE INDEX ix_conflicto_pendiente ON sync_conflicto(centro_venta_id) WHERE estado = 'PENDIENTE';

-- ---------- Auditoría ----------
CREATE TABLE auditoria (
  id          BIGSERIAL   PRIMARY KEY,
  tabla       VARCHAR(50) NOT NULL,
  registro_id VARCHAR(50) NOT NULL,
  accion      VARCHAR(10) NOT NULL CHECK (accion IN ('INSERT','UPDATE','DELETE')),
  antes       JSONB,
  despues     JSONB,
  usuario_id  INT,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_registro ON auditoria(tabla, registro_id);

-- =====================================================================
-- FUNCIONES Y TRIGGERS (las reglas de negocio viven también en la BD)
-- =====================================================================

-- Folio correlativo seguro aunque dos cajas pidan folio al mismo tiempo
CREATE OR REPLACE FUNCTION siguiente_folio(p_centro SMALLINT, p_fecha DATE)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_folio INT;
BEGIN
  INSERT INTO folio_contador(centro_venta_id, fecha_operacion, ultimo_folio)
  VALUES (p_centro, p_fecha, 1)
  ON CONFLICT (centro_venta_id, fecha_operacion)
  DO UPDATE SET ultimo_folio = folio_contador.ultimo_folio + 1
  RETURNING ultimo_folio INTO v_folio;
  RETURN v_folio;
END $$;

-- Recalcula el total y bloquea cambios en pedidos pagados o anulados
CREATE OR REPLACE FUNCTION recalcular_total_pedido()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_pedido UUID;
  v_estado estado_pedido;
BEGIN
  v_pedido := CASE WHEN TG_OP = 'DELETE' THEN OLD.pedido_id ELSE NEW.pedido_id END;

  SELECT estado INTO v_estado FROM pedido WHERE id = v_pedido FOR UPDATE;
  IF v_estado IN ('PAGADO','ANULADO') THEN
    RAISE EXCEPTION 'No se puede modificar un pedido en estado %', v_estado;
  END IF;

  UPDATE pedido p
     SET subtotal       = s.sub,
         total          = GREATEST(s.sub - p.descuento, 0),
         actualizado_en = now(),
         version        = p.version + 1
    FROM (SELECT COALESCE(SUM(importe), 0) AS sub
            FROM pedido_detalle
           WHERE pedido_id = v_pedido AND estado = 'ACTIVA') s
   WHERE p.id = v_pedido;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_recalcular_total
AFTER INSERT OR UPDATE OR DELETE ON pedido_detalle
FOR EACH ROW EXECUTE FUNCTION recalcular_total_pedido();

-- Evita cobrar dos veces o cobrar de más; marca PAGADO al completar el total
CREATE OR REPLACE FUNCTION validar_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total  NUMERIC(12,2);
  v_estado estado_pedido;
  v_pagado NUMERIC(12,2);
BEGIN
  -- FOR UPDATE bloquea el pedido: si dos cajeros cobran a la vez, el segundo espera
  SELECT total, estado INTO v_total, v_estado
    FROM pedido WHERE id = NEW.pedido_id FOR UPDATE;

  IF v_estado IN ('PAGADO','ANULADO') THEN
    RAISE EXCEPTION 'El pedido ya está % y no admite más cobros', v_estado;
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_pagado
    FROM pago WHERE pedido_id = NEW.pedido_id AND estado = 'APLICADO';

  IF v_pagado + NEW.monto > v_total THEN
    RAISE EXCEPTION 'Cobro excede el saldo. Total: %, ya pagado: %, intento: %',
                    v_total, v_pagado, NEW.monto;
  END IF;

  IF v_pagado + NEW.monto = v_total THEN
    UPDATE pedido
       SET estado = 'PAGADO', actualizado_en = now(), version = version + 1
     WHERE id = NEW.pedido_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validar_pago
BEFORE INSERT ON pago
FOR EACH ROW EXECUTE FUNCTION validar_pago();

-- Auditoría genérica: guarda el antes y el después de cada cambio
-- La API indica el usuario con:  SET LOCAL app.usuario_id = '5';
CREATE OR REPLACE FUNCTION fn_auditoria()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auditoria(tabla, registro_id, accion, antes, despues, usuario_id)
  VALUES (TG_TABLE_NAME,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END,
          TG_OP,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
          NULLIF(current_setting('app.usuario_id', true), '')::int);
  RETURN NULL;
END $$;

CREATE TRIGGER trg_aud_pedido  AFTER INSERT OR UPDATE OR DELETE ON pedido
FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER trg_aud_detalle AFTER INSERT OR UPDATE OR DELETE ON pedido_detalle
FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER trg_aud_pago    AFTER INSERT OR UPDATE OR DELETE ON pago
FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

-- =====================================================================
-- SINCRONIZACIÓN (modo sin internet)
-- La app guarda en la tablet una "cola" de operaciones. Al volver el internet
-- las envía en el mismo orden en que se hicieron (el pedido siempre antes que su pago).
--  · Si una operación ya había llegado      -> YA_EXISTIA  (no se duplica)
--  · Si se aplica bien                       -> APLICADO
--  · Si una regla la rechaza                 -> CONFLICTO   (va a la bandeja)
-- =====================================================================

CREATE OR REPLACE FUNCTION registrar_conflicto(
  p_centro SMALLINT, p_disp INT, p_tipo TEXT, p_op UUID, p_datos JSONB, p_motivo TEXT)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO sync_conflicto(centro_venta_id, dispositivo_id, tipo_operacion, operacion_id, datos, motivo)
  VALUES (p_centro, p_disp, p_tipo, p_op, p_datos, p_motivo)
  ON CONFLICT (operacion_id) DO NOTHING;
$$;

-- Traduce errores técnicos a mensajes claros para la bandeja del gerente
CREATE OR REPLACE FUNCTION motivo_conflicto(p_estado TEXT, p_restriccion TEXT, p_mensaje TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_restriccion = 'uq_pago_voucher'         THEN 'El número de autorización del voucher ya se usó en otro pago'
    WHEN p_restriccion = 'pago_pedido_id_fkey'     THEN 'El pedido de este pago no está en la nube (no llegó o quedó en conflicto)'
    WHEN p_restriccion = 'pedido_check'            THEN 'Pedido hecho sin internet que no trae folio provisional'
    WHEN p_restriccion = 'pedido_folio_offline_key' THEN 'Ese folio provisional ya existe en otro pedido'
    WHEN p_estado = '23502' AND p_mensaje LIKE '%turno_id%' THEN 'No hay turno de caja abierto para registrar el pago'
    WHEN p_estado = '23503'                        THEN 'Hace referencia a un dato que no existe (producto, usuario o pedido)'
    ELSE p_mensaje                                  -- las reglas propias ya vienen en español
  END;
$$;

-- Recibe un pedido (nuevo o existente) con sus líneas
CREATE OR REPLACE FUNCTION sync_pedido(p JSONB)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_id     UUID := (p->>'id')::uuid;
  v_disp   INT  := (p->>'dispositivo_id')::int;
  v_fecha  DATE := COALESCE((p->>'fecha_operacion')::date, CURRENT_DATE);  -- la fecha del dispositivo, no la de llegada
  v_centro SMALLINT;
  v_activo BOOLEAN;
  v_res    TEXT;
  v_lineas JSONB := '{}'::jsonb;
  l        JSONB;
  v_lid    UUID;
  v_lres   TEXT;
  e_estado TEXT;
  e_restr  TEXT;
  e_msg    TEXT;
BEGIN
  SELECT centro_venta_id, activo INTO v_centro, v_activo FROM dispositivo WHERE id = v_disp;
  IF v_centro IS NULL THEN
    RAISE EXCEPTION 'Dispositivo % no registrado', v_disp;
  END IF;

  -- 1) Encabezado
  IF EXISTS (SELECT 1 FROM pedido WHERE id = v_id) THEN
    v_res := 'YA_EXISTIA';
  ELSIF EXISTS (SELECT 1 FROM sync_conflicto WHERE operacion_id = v_id) THEN
    v_res := 'YA_EN_CONFLICTO';
  ELSIF NOT v_activo THEN
    PERFORM registrar_conflicto(v_centro, v_disp, 'PEDIDO', v_id, p, 'Dispositivo desactivado');
    v_res := 'CONFLICTO';
  ELSE
    BEGIN
      INSERT INTO pedido (id, centro_venta_id, fecha_operacion, folio, tipo_venta_id, turno_id,
                          mesa_referencia, cliente_nombre, creado_por, creado_en,
                          dispositivo_id, origen, folio_offline)
      VALUES (v_id, v_centro, v_fecha, siguiente_folio(v_centro, v_fecha),
              (p->>'tipo_venta_id')::smallint, (p->>'turno_id')::int,
              p->>'mesa_referencia', p->>'cliente_nombre', (p->>'creado_por')::int,
              COALESCE((p->>'creado_en')::timestamptz, now()),
              v_disp, COALESCE((p->>'origen')::origen_registro, 'EN_LINEA'), p->>'folio_offline');
      v_res := 'APLICADO';
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS e_estado = RETURNED_SQLSTATE, e_restr = CONSTRAINT_NAME, e_msg = MESSAGE_TEXT;
        IF EXISTS (SELECT 1 FROM pedido WHERE id = v_id) THEN
          v_res := 'YA_EXISTIA';           -- llegó dos veces al mismo tiempo
        ELSE
          PERFORM registrar_conflicto(v_centro, v_disp, 'PEDIDO', v_id, p, motivo_conflicto(e_estado, e_restr, e_msg));
          v_res := 'CONFLICTO';
        END IF;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS e_estado = RETURNED_SQLSTATE, e_restr = CONSTRAINT_NAME, e_msg = MESSAGE_TEXT;
        PERFORM registrar_conflicto(v_centro, v_disp, 'PEDIDO', v_id, p, motivo_conflicto(e_estado, e_restr, e_msg));
        v_res := 'CONFLICTO';
    END;
  END IF;

  -- Si el encabezado quedó en conflicto, sus líneas viajan dentro de "datos"
  IF v_res IN ('CONFLICTO','YA_EN_CONFLICTO') THEN
    UPDATE dispositivo SET ultima_sincronizacion = now() WHERE id = v_disp;
    RETURN jsonb_build_object('pedido', v_res);
  END IF;

  -- 2) Líneas (cada una se aplica o va a conflicto por separado)
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(p->'lineas', '[]'::jsonb)) LOOP
    v_lid := (l->>'id')::uuid;
    IF EXISTS (SELECT 1 FROM pedido_detalle WHERE id = v_lid) THEN
      v_lres := 'YA_EXISTIA';
    ELSIF EXISTS (SELECT 1 FROM sync_conflicto WHERE operacion_id = v_lid) THEN
      v_lres := 'YA_EN_CONFLICTO';
    ELSIF NOT v_activo THEN
      PERFORM registrar_conflicto(v_centro, v_disp, 'LINEA', v_lid,
              l || jsonb_build_object('pedido_id', v_id), 'Dispositivo desactivado');
      v_lres := 'CONFLICTO';
    ELSE
      BEGIN
        INSERT INTO pedido_detalle (id, pedido_id, producto_id, cantidad, precio_unitario,
                                    notas, agregado_por, agregado_en, origen)
        VALUES (v_lid, v_id, (l->>'producto_id')::int, (l->>'cantidad')::numeric,
                (l->>'precio_unitario')::numeric, l->>'notas', (l->>'agregado_por')::int,
                COALESCE((l->>'agregado_en')::timestamptz, now()),
                COALESCE((p->>'origen')::origen_registro, 'EN_LINEA'));
        v_lres := 'APLICADO';
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS e_estado = RETURNED_SQLSTATE, e_restr = CONSTRAINT_NAME, e_msg = MESSAGE_TEXT;
        PERFORM registrar_conflicto(v_centro, v_disp, 'LINEA', v_lid,
                l || jsonb_build_object('pedido_id', v_id), motivo_conflicto(e_estado, e_restr, e_msg));
        v_lres := 'CONFLICTO';
      END;
    END IF;
    v_lineas := v_lineas || jsonb_build_object(v_lid::text, v_lres);
  END LOOP;

  UPDATE dispositivo SET ultima_sincronizacion = now() WHERE id = v_disp;
  RETURN jsonb_build_object('pedido', v_res,
                            'folio', (SELECT folio FROM pedido WHERE id = v_id),
                            'lineas', v_lineas);
END $$;

-- Recibe un pago hecho con o sin internet
CREATE OR REPLACE FUNCTION sync_pago(p JSONB)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_id     UUID := (p->>'id')::uuid;
  v_disp   INT  := (p->>'dispositivo_id')::int;
  v_centro SMALLINT;
  v_activo BOOLEAN;
  v_res    TEXT;
  e_estado TEXT;
  e_restr  TEXT;
  e_msg    TEXT;
BEGIN
  SELECT centro_venta_id, activo INTO v_centro, v_activo FROM dispositivo WHERE id = v_disp;
  IF v_centro IS NULL THEN
    RAISE EXCEPTION 'Dispositivo % no registrado', v_disp;
  END IF;

  IF EXISTS (SELECT 1 FROM pago WHERE id = v_id) THEN
    v_res := 'YA_EXISTIA';
  ELSIF EXISTS (SELECT 1 FROM sync_conflicto WHERE operacion_id = v_id) THEN
    v_res := 'YA_EN_CONFLICTO';
  ELSIF NOT v_activo THEN
    PERFORM registrar_conflicto(v_centro, v_disp, 'PAGO', v_id, p, 'Dispositivo desactivado');
    v_res := 'CONFLICTO';
  ELSE
    BEGIN
      INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, fecha_operacion, monto,
                        terminal_pos, referencia_pos, registrado_por, registrado_en,
                        dispositivo_id, origen)
      VALUES (v_id, (p->>'pedido_id')::uuid, (p->>'metodo_pago_id')::smallint,
              COALESCE((p->>'turno_id')::int,
                       (SELECT id FROM turno_caja WHERE centro_venta_id = v_centro AND estado = 'ABIERTO')),
              COALESCE((p->>'fecha_operacion')::date, CURRENT_DATE),
              (p->>'monto')::numeric, p->>'terminal_pos', p->>'referencia_pos',
              (p->>'registrado_por')::int, COALESCE((p->>'registrado_en')::timestamptz, now()),
              v_disp, COALESCE((p->>'origen')::origen_registro, 'EN_LINEA'));
      v_res := 'APLICADO';
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS e_estado = RETURNED_SQLSTATE, e_restr = CONSTRAINT_NAME, e_msg = MESSAGE_TEXT;
        IF EXISTS (SELECT 1 FROM pago WHERE id = v_id) THEN
          v_res := 'YA_EXISTIA';
        ELSE
          PERFORM registrar_conflicto(v_centro, v_disp, 'PAGO', v_id, p, motivo_conflicto(e_estado, e_restr, e_msg));
          v_res := 'CONFLICTO';
        END IF;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS e_estado = RETURNED_SQLSTATE, e_restr = CONSTRAINT_NAME, e_msg = MESSAGE_TEXT;
        PERFORM registrar_conflicto(v_centro, v_disp, 'PAGO', v_id, p, motivo_conflicto(e_estado, e_restr, e_msg));
        v_res := 'CONFLICTO';
    END;
  END IF;

  UPDATE dispositivo SET ultima_sincronizacion = now() WHERE id = v_disp;
  RETURN v_res;
END $$;

-- =====================================================================
-- (Opcional) Seguridad por centro de venta con Row Level Security
-- La API indica los centros del usuario con: SET LOCAL app.centros = '1,2';
-- =====================================================================
-- ALTER TABLE pedido ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY pol_pedido_centro ON pedido
--   USING (centro_venta_id = ANY (string_to_array(current_setting('app.centros', true), ',')::smallint[]));
