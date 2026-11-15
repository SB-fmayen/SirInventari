-- =====================================================================
-- SISTEMA DE VENTAS  ·  Esquema PostgreSQL 16  ·  v0.3
-- Nube + modo sin internet · por centros de venta · anti-duplicado
-- v0.2: dispositivos, folio provisional sin internet, origen del registro,
--       bandeja de conflictos y funciones de sincronización idempotentes
-- v0.3: correcciones de REVISION.md:
--       1) no se mezclan pedidos, pagos, turnos, dispositivos ni usuarios de centros distintos
--       2) tarjeta exige voucher y terminal; el voucher se normaliza
--       3) los pagos no se editan ni borran: se anulan con responsable y motivo,
--          y el pedido vuelve a aceptar cobros
--       4) el total se recalcula siempre (también con el descuento) y no puede
--          quedar por debajo de lo cobrado
--       5) no se cobra en turnos cerrados; un cobro atrasado va a la bandeja de conflictos
--       6) la fecha de operación usa la hora de Guatemala aunque la conexión esté en UTC
--       7) una línea no se puede mover a otro pedido
--       8) reenviar una línea ya guardada responde YA_EXISTIA (no crea conflicto falso)
-- =====================================================================
-- La "fecha de operación" se calcula con la hora de Guatemala con fecha_guatemala().
-- Recomendado además (cambia el nombre de la base si es otro):
-- ALTER DATABASE sistema_ventas SET timezone TO 'America/Guatemala';

CREATE SCHEMA IF NOT EXISTS ventas;
SET search_path TO ventas;

-- Fecha de hoy en Guatemala, sin importar la zona horaria de la conexión
CREATE OR REPLACE FUNCTION fecha_guatemala(p_momento TIMESTAMPTZ DEFAULT now())
RETURNS DATE LANGUAGE sql STABLE AS $$
  SELECT (p_momento AT TIME ZONE 'America/Guatemala')::date;
$$;

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
  requiere_referencia BOOLEAN     NOT NULL DEFAULT FALSE,  -- TRUE para tarjeta/transferencia
  requiere_terminal   BOOLEAN     NOT NULL DEFAULT FALSE   -- TRUE para tarjeta: se cobra en una terminal del POS
);

CREATE TABLE turno_caja (
  id               SERIAL        PRIMARY KEY,
  centro_venta_id  SMALLINT      NOT NULL REFERENCES centro_venta(id),
  fecha_operacion  DATE          NOT NULL DEFAULT fecha_guatemala(),
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
  fecha_operacion DATE          NOT NULL DEFAULT fecha_guatemala(),
  folio           INT           NOT NULL,        -- lo asigna el servidor al recibir el pedido
  tipo_venta_id   SMALLINT      NOT NULL REFERENCES tipo_venta(id),
  turno_id        INT           REFERENCES turno_caja(id),
  mesa_referencia VARCHAR(30),
  cliente_nombre  VARCHAR(100),
  estado          estado_pedido NOT NULL DEFAULT 'ABIERTO',
  -- Autorizado el 2026-11-01: la preparación no cambia el estado de cobro.
  estado_cocina   VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CONSTRAINT ck_pedido_estado_cocina CHECK (estado_cocina IN ('PENDIENTE','EN_PREPARACION','LISTO','ENTREGADO')),
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
  fecha_operacion  DATE          NOT NULL DEFAULT fecha_guatemala(),
  monto            NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  terminal_pos     VARCHAR(30),                 -- terminal del POS externo
  referencia_pos   VARCHAR(40),                 -- nº de autorización del voucher
  estado           estado_pago   NOT NULL DEFAULT 'APLICADO',
  registrado_por   INT           NOT NULL REFERENCES usuario(id),
  registrado_en    TIMESTAMPTZ   NOT NULL DEFAULT now(),   -- hora real del cobro (la del dispositivo)
  anulado_por      INT           REFERENCES usuario(id),
  anulado_en       TIMESTAMPTZ,
  motivo_anulacion VARCHAR(200),
  dispositivo_id   INT             REFERENCES dispositivo(id),
  origen           origen_registro NOT NULL DEFAULT 'EN_LINEA',
  sincronizado_en  TIMESTAMPTZ     NOT NULL DEFAULT now(),
  -- Un pago anulado siempre dice quién lo anuló y por qué
  CHECK (estado = 'APLICADO' OR (anulado_por IS NOT NULL AND motivo_anulacion IS NOT NULL))
);
-- Un mismo voucher del POS NO puede registrarse dos veces.
-- COALESCE: una terminal vacía (NULL) también cuenta como repetida.
CREATE UNIQUE INDEX uq_pago_voucher ON pago(COALESCE(terminal_pos, ''), fecha_operacion, referencia_pos)
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

-- ¿El usuario está activo y puede trabajar en ese centro? (ADMIN puede en todos)
CREATE OR REPLACE FUNCTION usuario_en_centro(p_usuario INT, p_centro SMALLINT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuario u
     WHERE u.id = p_usuario AND u.activo
       AND (u.rol = 'ADMIN'
            OR EXISTS (SELECT 1 FROM usuario_centro uc
                        WHERE uc.usuario_id = u.id AND uc.centro_venta_id = p_centro)));
$$;

-- Encabezado del pedido:
--  · no mezcla centros (usuario, dispositivo y turno deben ser del mismo centro)
--  · el subtotal y el total siempre se calculan aquí (nadie los escribe a mano)
--  · el total nunca queda por debajo de lo ya cobrado
CREATE OR REPLACE FUNCTION calcular_pedido()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_pagado NUMERIC(12,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT usuario_en_centro(NEW.creado_por, NEW.centro_venta_id) THEN
      RAISE EXCEPTION 'El usuario % no está activo o no está asignado a este centro de venta', NEW.creado_por;
    END IF;
    IF NEW.dispositivo_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM dispositivo WHERE id = NEW.dispositivo_id AND centro_venta_id = NEW.centro_venta_id) THEN
      RAISE EXCEPTION 'El dispositivo no pertenece al centro de venta del pedido';
    END IF;
    IF NEW.turno_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM turno_caja WHERE id = NEW.turno_id AND centro_venta_id = NEW.centro_venta_id) THEN
      RAISE EXCEPTION 'El turno de caja no pertenece al centro de venta del pedido';
    END IF;
    NEW.subtotal := 0;                        -- las líneas llegan después
  ELSE
    IF NEW.centro_venta_id <> OLD.centro_venta_id THEN
      RAISE EXCEPTION 'Un pedido no se puede pasar a otro centro de venta';
    END IF;
    IF NEW.turno_id IS DISTINCT FROM OLD.turno_id AND NEW.turno_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM turno_caja WHERE id = NEW.turno_id AND centro_venta_id = NEW.centro_venta_id) THEN
      RAISE EXCEPTION 'El turno de caja no pertenece al centro de venta del pedido';
    END IF;
    IF OLD.estado IN ('PAGADO','ANULADO') AND NEW.descuento <> OLD.descuento THEN
      RAISE EXCEPTION 'No se puede cambiar el descuento de un pedido en estado %', OLD.estado;
    END IF;
    SELECT COALESCE(SUM(importe), 0) INTO NEW.subtotal
      FROM pedido_detalle WHERE pedido_id = NEW.id AND estado = 'ACTIVA';
  END IF;

  NEW.total := GREATEST(NEW.subtotal - NEW.descuento, 0);

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(SUM(monto), 0) INTO v_pagado
      FROM pago WHERE pedido_id = NEW.id AND estado = 'APLICADO';
    IF NEW.total < v_pagado THEN
      RAISE EXCEPTION 'El total del pedido (Q%) no puede quedar menor que lo ya cobrado (Q%). Primero anule el cobro.',
                      NEW.total, v_pagado;
    END IF;
    -- Si el total bajó (descuento o línea anulada) y ya quedó cubierto, el pedido queda pagado
    IF NEW.total <> OLD.total AND v_pagado > 0 AND NEW.total = v_pagado
       AND NEW.estado NOT IN ('PAGADO','ANULADO') THEN
      NEW.estado := 'PAGADO';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_calcular_pedido
BEFORE INSERT OR UPDATE ON pedido
FOR EACH ROW EXECUTE FUNCTION calcular_pedido();

-- Líneas: una línea no cambia de pedido, y quien la agrega debe ser del centro del pedido
CREATE OR REPLACE FUNCTION validar_linea()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_centro SMALLINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.pedido_id <> OLD.pedido_id THEN
      RAISE EXCEPTION 'Un producto no se puede mover a otro pedido. Anúlelo y agréguelo en el otro pedido.';
    END IF;
  ELSE
    SELECT centro_venta_id INTO v_centro FROM pedido WHERE id = NEW.pedido_id;
    IF FOUND AND NOT usuario_en_centro(NEW.agregado_por, v_centro) THEN
      RAISE EXCEPTION 'El usuario % no está activo o no está asignado al centro de venta del pedido', NEW.agregado_por;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validar_linea
BEFORE INSERT OR UPDATE ON pedido_detalle
FOR EACH ROW EXECUTE FUNCTION validar_linea();

-- Bloquea cambios en pedidos pagados o anulados y hace que el pedido recalcule su total
-- (el cálculo lo hace calcular_pedido al actualizar el encabezado)
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

  UPDATE pedido
     SET actualizado_en = now(),
         version        = version + 1
   WHERE id = v_pedido;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_recalcular_total
AFTER INSERT OR UPDATE OR DELETE ON pedido_detalle
FOR EACH ROW EXECUTE FUNCTION recalcular_total_pedido();

-- Evita cobrar dos veces o cobrar de más; marca PAGADO al completar el total
CREATE OR REPLACE FUNCTION validar_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total         NUMERIC(12,2);
  v_estado        estado_pedido;
  v_centro        SMALLINT;
  v_pagado        NUMERIC(12,2);
  v_turno_centro  SMALLINT;
  v_turno_estado  estado_turno;
  v_turno_abierto TIMESTAMPTZ;
  v_req_ref       BOOLEAN;
  v_req_term      BOOLEAN;
BEGIN
  -- FOR UPDATE bloquea el pedido: si dos cajeros cobran a la vez, el segundo espera
  SELECT total, estado, centro_venta_id INTO v_total, v_estado, v_centro
    FROM pedido WHERE id = NEW.pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido de este pago no está en la nube (no llegó o quedó en conflicto)';
  END IF;

  IF v_estado IN ('PAGADO','ANULADO') THEN
    RAISE EXCEPTION 'El pedido ya está % y no admite más cobros', v_estado;
  END IF;

  -- Turno: debe existir, ser del mismo centro y estar abierto
  SELECT centro_venta_id, estado, abierto_en INTO v_turno_centro, v_turno_estado, v_turno_abierto
    FROM turno_caja WHERE id = NEW.turno_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay turno de caja abierto para registrar el pago';
  END IF;
  IF v_turno_centro <> v_centro THEN
    RAISE EXCEPTION 'El turno de caja no pertenece al centro de venta del pedido';
  END IF;
  IF v_turno_estado <> 'ABIERTO' THEN
    RAISE EXCEPTION 'El turno de caja ya está cerrado; el cobro debe revisarlo el gerente';
  END IF;
  -- Cobro hecho sin internet antes de que abriera este turno = cobro atrasado
  IF NEW.origen <> 'EN_LINEA' AND NEW.registrado_en < v_turno_abierto THEN
    RAISE EXCEPTION 'Cobro atrasado: se hizo antes de que se abriera el turno de caja actual; el gerente debe revisarlo';
  END IF;

  -- Dispositivo y usuario del mismo centro
  IF NEW.dispositivo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM dispositivo WHERE id = NEW.dispositivo_id AND centro_venta_id = v_centro) THEN
    RAISE EXCEPTION 'El dispositivo no pertenece al centro de venta del pedido';
  END IF;
  IF NOT usuario_en_centro(NEW.registrado_por, v_centro) THEN
    RAISE EXCEPTION 'El usuario % no está activo o no está asignado al centro de venta del pedido', NEW.registrado_por;
  END IF;

  -- Voucher: se guarda sin espacios y en mayúsculas para que no se pueda repetir con otro formato
  NEW.referencia_pos := NULLIF(upper(regexp_replace(NEW.referencia_pos, '\s', '', 'g')), '');
  NEW.terminal_pos   := NULLIF(upper(regexp_replace(NEW.terminal_pos,   '\s', '', 'g')), '');
  SELECT requiere_referencia, requiere_terminal INTO v_req_ref, v_req_term
    FROM metodo_pago WHERE id = NEW.metodo_pago_id;
  IF v_req_ref AND NEW.referencia_pos IS NULL THEN
    RAISE EXCEPTION 'Falta el número de autorización del voucher para este método de pago';
  END IF;
  IF v_req_term AND NEW.terminal_pos IS NULL THEN
    RAISE EXCEPTION 'Falta la terminal del POS para este cobro con tarjeta';
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

-- Un pago no se edita ni se borra. Lo único permitido es anularlo, con responsable y motivo.
CREATE OR REPLACE FUNCTION proteger_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c_libres CONSTANT TEXT[] := ARRAY['estado','anulado_por','anulado_en','motivo_anulacion'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los pagos no se borran. Si hay un error, anule el pago indicando el motivo.';
  END IF;
  IF OLD.estado = 'ANULADO' THEN
    RAISE EXCEPTION 'Este pago ya está anulado y no se puede cambiar';
  END IF;
  IF (to_jsonb(NEW) - c_libres) IS DISTINCT FROM (to_jsonb(OLD) - c_libres) THEN
    RAISE EXCEPTION 'Un pago registrado no se puede modificar. Anúlelo y registre uno nuevo.';
  END IF;
  IF NEW.estado = 'ANULADO' THEN
    NEW.anulado_en := COALESCE(NEW.anulado_en, now());
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_proteger_pago
BEFORE UPDATE OR DELETE ON pago
FOR EACH ROW EXECUTE FUNCTION proteger_pago();

-- Al anular un pago, el pedido pagado vuelve a ABIERTO para aceptar el cobro de reemplazo
CREATE OR REPLACE FUNCTION pago_anulado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado = 'APLICADO' AND NEW.estado = 'ANULADO' THEN
    UPDATE pedido
       SET estado         = CASE WHEN estado = 'PAGADO' THEN 'ABIERTO'::estado_pedido ELSE estado END,
           actualizado_en = now(),
           version        = version + 1
     WHERE id = NEW.pedido_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_pago_anulado
AFTER UPDATE ON pago
FOR EACH ROW EXECUTE FUNCTION pago_anulado();

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
  -- la fecha del dispositivo, no la de llegada; si no viene, la de Guatemala en que se tomó
  v_fecha  DATE := COALESCE((p->>'fecha_operacion')::date,
                            fecha_guatemala(COALESCE((p->>'creado_en')::timestamptz, now())));
  v_centro SMALLINT;
  v_activo BOOLEAN;
  v_ped_centro SMALLINT;
  v_res    TEXT;
  v_lineas JSONB := '{}'::jsonb;
  l        JSONB;
  v_lid    UUID;
  v_lped   UUID;
  v_lres   TEXT;
  e_estado TEXT;
  e_restr  TEXT;
  e_msg    TEXT;
BEGIN
  SELECT centro_venta_id, activo INTO v_centro, v_activo FROM dispositivo WHERE id = v_disp;
  IF v_centro IS NULL THEN
    RAISE EXCEPTION 'Dispositivo % no registrado', v_disp;
  END IF;

  SELECT centro_venta_id INTO v_ped_centro FROM pedido WHERE id = v_id;

  -- 1) Encabezado
  IF v_ped_centro = v_centro THEN
    v_res := 'YA_EXISTIA';
  ELSIF EXISTS (SELECT 1 FROM sync_conflicto WHERE operacion_id = v_id) THEN
    v_res := 'YA_EN_CONFLICTO';
  ELSIF v_ped_centro IS NOT NULL THEN
    -- El pedido existe pero es de otro centro: no se toca
    PERFORM registrar_conflicto(v_centro, v_disp, 'PEDIDO', v_id, p,
            'El pedido pertenece a otro centro de venta');
    v_res := 'CONFLICTO';
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
        IF EXISTS (SELECT 1 FROM pedido WHERE id = v_id AND centro_venta_id = v_centro) THEN
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
    SELECT pedido_id INTO v_lped FROM pedido_detalle WHERE id = v_lid;
    IF v_lped = v_id THEN
      v_lres := 'YA_EXISTIA';
    ELSIF EXISTS (SELECT 1 FROM sync_conflicto WHERE operacion_id = v_lid) THEN
      v_lres := 'YA_EN_CONFLICTO';
    ELSIF v_lped IS NOT NULL THEN
      PERFORM registrar_conflicto(v_centro, v_disp, 'LINEA', v_lid,
              l || jsonb_build_object('pedido_id', v_id), 'Esa línea ya existe en otro pedido');
      v_lres := 'CONFLICTO';
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
      EXCEPTION
        WHEN unique_violation THEN
          GET STACKED DIAGNOSTICS e_estado = RETURNED_SQLSTATE, e_restr = CONSTRAINT_NAME, e_msg = MESSAGE_TEXT;
          IF EXISTS (SELECT 1 FROM pedido_detalle WHERE id = v_lid AND pedido_id = v_id) THEN
            v_lres := 'YA_EXISTIA';        -- la misma línea llegó dos veces al mismo tiempo
          ELSE
            PERFORM registrar_conflicto(v_centro, v_disp, 'LINEA', v_lid,
                    l || jsonb_build_object('pedido_id', v_id), motivo_conflicto(e_estado, e_restr, e_msg));
            v_lres := 'CONFLICTO';
          END IF;
        WHEN OTHERS THEN
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
      -- Si no trae turno se usa el abierto del centro; validar_pago rechaza (va a la bandeja)
      -- un turno cerrado, de otro centro, o un cobro atrasado hecho antes de que abriera el turno.
      VALUES (v_id, (p->>'pedido_id')::uuid, (p->>'metodo_pago_id')::smallint,
              COALESCE((p->>'turno_id')::int,
                       (SELECT id FROM turno_caja WHERE centro_venta_id = v_centro AND estado = 'ABIERTO')),
              COALESCE((p->>'fecha_operacion')::date,
                       fecha_guatemala(COALESCE((p->>'registrado_en')::timestamptz, now()))),
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

-- Mejoras de módulos autorizadas por el usuario
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

-- Clientes y papelera: ampliación autorizada 2026-11-08.
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

-- Seguridad por centro (Row Level Security): ampliación autorizada 2026-11-15. Ver db/08_seguridad_centros.sql.
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
