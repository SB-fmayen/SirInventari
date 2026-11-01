-- =====================================================================
-- Pruebas de los 7 casos de la especificación (esquema v0.3)
--  1) Cobro doble                      5) Dos turnos abiertos en el mismo centro
--  2) Voucher repetido                 6) Pago dividido
--  3) Cobro mayor al saldo             7) Conciliación con el cierre del POS
--  4) Productos agregados a un pedido pagado
--
-- Cómo correrlas (con la base de Docker encendida):
--   docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /pruebas/casos.sql'
--
-- Todo corre dentro de una transacción que al final se deshace (ROLLBACK):
-- la base queda igual que antes. Si un caso falla, se detiene con "FALLA caso N".
-- Usa los datos de db/02_datos_iniciales.sql (usuario 1 = mesero, 2 = cajero, turno 1 abierto en CV01).
-- =====================================================================
\set QUIET on
\pset pager off
SET client_min_messages TO notice;
BEGIN;
SET LOCAL search_path TO ventas;

-- ---------- Preparación: tres pedidos en el centro 1 ----------
-- Pedido A: 2 platos (90) + 2 refrescos (24) + 1 refresco agregado después (12) = 126
INSERT INTO pedido (id, centro_venta_id, folio, tipo_venta_id, turno_id, creado_por, mesa_referencia)
VALUES ('11111111-1111-1111-1111-111111111111', 1, siguiente_folio(1::smallint, fecha_guatemala()), 1, 1, 1, 'Mesa 4');
INSERT INTO pedido_detalle (id, pedido_id, producto_id, cantidad, precio_unitario, agregado_por) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 2, 45.00, 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 2, 2, 12.00, 1);
INSERT INTO pedido_detalle (id, pedido_id, producto_id, cantidad, precio_unitario, agregado_por, notas)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 2, 1, 12.00, 1, 'Sin hielo');

-- Pedido B: 1 plato = 45
INSERT INTO pedido (id, centro_venta_id, folio, tipo_venta_id, turno_id, creado_por)
VALUES ('22222222-2222-2222-2222-222222222222', 1, siguiente_folio(1::smallint, fecha_guatemala()), 2, 1, 2);
INSERT INTO pedido_detalle (id, pedido_id, producto_id, cantidad, precio_unitario, agregado_por)
VALUES ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 1, 1, 45.00, 2);

-- Pedido C: 1 plato + 1 refresco = 57
INSERT INTO pedido (id, centro_venta_id, folio, tipo_venta_id, turno_id, creado_por)
VALUES ('33333333-3333-3333-3333-333333333333', 1, siguiente_folio(1::smallint, fecha_guatemala()), 1, 1, 1);
INSERT INTO pedido_detalle (id, pedido_id, producto_id, cantidad, precio_unitario, agregado_por) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 1, 1, 45.00, 1),
  ('aaaaaaaa-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 2, 1, 12.00, 1);

DO $$
DECLARE v_a NUMERIC; v_b NUMERIC; v_c NUMERIC; v_folios INT[];
BEGIN
  SELECT total INTO v_a FROM pedido WHERE id = '11111111-1111-1111-1111-111111111111';
  SELECT total INTO v_b FROM pedido WHERE id = '22222222-2222-2222-2222-222222222222';
  SELECT total INTO v_c FROM pedido WHERE id = '33333333-3333-3333-3333-333333333333';
  IF v_a <> 126 OR v_b <> 45 OR v_c <> 57 THEN
    RAISE EXCEPTION 'FALLA preparación: totales %, %, % (se esperaba 126, 45, 57)', v_a, v_b, v_c;
  END IF;
  SELECT array_agg(folio ORDER BY folio) INTO v_folios FROM pedido WHERE fecha_operacion = fecha_guatemala();
  IF v_folios <> ARRAY[1,2,3] THEN
    RAISE EXCEPTION 'FALLA preparación: folios % (se esperaba 1, 2, 3)', v_folios;
  END IF;
  RAISE NOTICE 'OK  preparación: totales 126, 45 y 57; folios 1, 2 y 3';
END $$;

-- ---------- Caso 1: cobro doble ----------
-- Se cobra el pedido A completo con tarjeta; un segundo cobro debe rechazarse.
INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, monto, terminal_pos, referencia_pos, registrado_por)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 2, 1, 126.00, 'TERM-01', '458712', 2);

DO $$
BEGIN
  IF (SELECT estado FROM pedido WHERE id = '11111111-1111-1111-1111-111111111111') <> 'PAGADO' THEN
    RAISE EXCEPTION 'FALLA caso 1: el pedido A no quedó PAGADO al cobrar el total';
  END IF;
  BEGIN
    INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, monto, registrado_por)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000099', '11111111-1111-1111-1111-111111111111', 1, 1, 10.00, 2);
    RAISE EXCEPTION 'FALLA caso 1: permitió cobrar dos veces el mismo pedido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALLA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%ya está PAGADO%' THEN
      RAISE EXCEPTION 'FALLA caso 1: error inesperado: %', SQLERRM;
    END IF;
    RAISE NOTICE 'OK  caso 1 · cobro doble rechazado: %', SQLERRM;
  END;
END $$;

-- ---------- Caso 2: voucher repetido ----------
-- El pedido B intenta usar el mismo voucher del pedido A, escrito con otro formato.
DO $$
BEGIN
  BEGIN
    INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, monto, terminal_pos, referencia_pos, registrado_por)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 2, 1, 45.00, ' term-01 ', '458 712', 2);
    RAISE EXCEPTION 'FALLA caso 2: permitió repetir el voucher 458712';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALLA%' THEN RAISE; END IF;
    IF SQLSTATE <> '23505' OR SQLERRM NOT LIKE '%uq_pago_voucher%' THEN
      RAISE EXCEPTION 'FALLA caso 2: error inesperado: %', SQLERRM;
    END IF;
    RAISE NOTICE 'OK  caso 2 · voucher repetido rechazado (aunque venga con espacios y minúsculas)';
  END;
  -- Tarjeta sin número de autorización tampoco se acepta
  BEGIN
    INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, monto, terminal_pos, registrado_por)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 2, 1, 45.00, 'TERM-01', 2);
    RAISE EXCEPTION 'FALLA caso 2: permitió cobrar con tarjeta sin voucher';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALLA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Falta el número de autorización%' THEN
      RAISE EXCEPTION 'FALLA caso 2: error inesperado: %', SQLERRM;
    END IF;
    RAISE NOTICE 'OK  caso 2 · tarjeta sin voucher rechazada: %', SQLERRM;
  END;
END $$;

-- ---------- Caso 3: cobro mayor al saldo ----------
DO $$
BEGIN
  BEGIN
    INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, monto, registrado_por)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 1, 1, 50.00, 2);
    RAISE EXCEPTION 'FALLA caso 3: permitió cobrar Q50 en un pedido de Q45';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALLA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Cobro excede el saldo%' THEN
      RAISE EXCEPTION 'FALLA caso 3: error inesperado: %', SQLERRM;
    END IF;
    RAISE NOTICE 'OK  caso 3 · cobro mayor al saldo rechazado: %', SQLERRM;
  END;
  IF (SELECT estado FROM pedido WHERE id = '22222222-2222-2222-2222-222222222222') <> 'ABIERTO' THEN
    RAISE EXCEPTION 'FALLA caso 3: el pedido B cambió de estado tras el cobro rechazado';
  END IF;
END $$;

-- ---------- Caso 4: productos agregados a un pedido pagado ----------
DO $$
BEGIN
  BEGIN
    INSERT INTO pedido_detalle (id, pedido_id, producto_id, cantidad, precio_unitario, agregado_por)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000099', '11111111-1111-1111-1111-111111111111', 2, 1, 12.00, 1);
    RAISE EXCEPTION 'FALLA caso 4: permitió agregar productos a un pedido pagado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALLA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'No se puede modificar un pedido en estado PAGADO%' THEN
      RAISE EXCEPTION 'FALLA caso 4: error inesperado: %', SQLERRM;
    END IF;
    RAISE NOTICE 'OK  caso 4 · producto en pedido pagado rechazado: %', SQLERRM;
  END;
END $$;

-- ---------- Caso 5: dos turnos abiertos en el mismo centro ----------
DO $$
BEGIN
  BEGIN
    INSERT INTO turno_caja (centro_venta_id, abierto_por, fondo_inicial) VALUES (1, 2, 100.00);
    RAISE EXCEPTION 'FALLA caso 5: permitió abrir un segundo turno en CV01';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALLA%' THEN RAISE; END IF;
    IF SQLSTATE <> '23505' OR SQLERRM NOT LIKE '%uq_turno_abierto%' THEN
      RAISE EXCEPTION 'FALLA caso 5: error inesperado: %', SQLERRM;
    END IF;
    RAISE NOTICE 'OK  caso 5 · segundo turno abierto rechazado';
  END;
END $$;

-- ---------- Caso 6: pago dividido ----------
-- Pedido C (Q57): Q30 en efectivo + Q27 con tarjeta.
INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, monto, registrado_por)
VALUES ('bbbbbbbb-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 1, 1, 30.00, 2);

DO $$
BEGIN
  IF (SELECT estado FROM pedido WHERE id = '33333333-3333-3333-3333-333333333333') = 'PAGADO' THEN
    RAISE EXCEPTION 'FALLA caso 6: el pedido C quedó PAGADO con solo Q30 de Q57';
  END IF;
END $$;

INSERT INTO pago (id, pedido_id, metodo_pago_id, turno_id, monto, terminal_pos, referencia_pos, registrado_por)
VALUES ('bbbbbbbb-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 2, 1, 27.00, 'TERM-01', '900001', 2);

DO $$
DECLARE v_pagado NUMERIC;
BEGIN
  SELECT SUM(monto) INTO v_pagado FROM pago
   WHERE pedido_id = '33333333-3333-3333-3333-333333333333' AND estado = 'APLICADO';
  IF (SELECT estado FROM pedido WHERE id = '33333333-3333-3333-3333-333333333333') <> 'PAGADO' OR v_pagado <> 57 THEN
    RAISE EXCEPTION 'FALLA caso 6: el pedido C no quedó PAGADO con Q30 + Q27 (pagado: %)', v_pagado;
  END IF;
  RAISE NOTICE 'OK  caso 6 · pago dividido: Q30 efectivo + Q27 tarjeta = Q57, pedido PAGADO';
END $$;

-- ---------- Caso 7: conciliación con el cierre del POS ----------
-- Cierre del POS de hoy:
--   458712  Q126  → coincide con el pedido A
--   900001  Q20   → existe en el sistema pero por Q27 (diferencia de monto)
--   777777  Q50   → cobro en el POS SIN pedido (posible doble cobro)
INSERT INTO pos_transaccion (centro_venta_id, fecha_operacion, terminal_pos, referencia_pos, monto, archivo_origen) VALUES
  (1, fecha_guatemala(), 'TERM-01', '458712', 126.00, 'prueba.csv'),
  (1, fecha_guatemala(), 'TERM-01', '900001',  20.00, 'prueba.csv'),
  (1, fecha_guatemala(), 'TERM-01', '777777',  50.00, 'prueba.csv');

DO $$
DECLARE
  v_sin_pedido TEXT[];
  v_sin_pos    INT;
  v_diferencia TEXT[];
BEGIN
  -- Cobros del POS que no están ligados a ningún pedido
  SELECT array_agg(t.referencia_pos) INTO v_sin_pedido
    FROM pos_transaccion t
    LEFT JOIN pago pg ON pg.terminal_pos = t.terminal_pos AND pg.referencia_pos = t.referencia_pos
                     AND pg.fecha_operacion = t.fecha_operacion AND pg.estado = 'APLICADO'
   WHERE t.fecha_operacion = fecha_guatemala() AND pg.id IS NULL;

  -- Pagos con tarjeta del sistema que no aparecen en el cierre del POS
  SELECT COUNT(*) INTO v_sin_pos
    FROM pago pg
    JOIN metodo_pago m ON m.id = pg.metodo_pago_id AND m.codigo = 'TARJETA'
    LEFT JOIN pos_transaccion t ON t.terminal_pos = pg.terminal_pos AND t.referencia_pos = pg.referencia_pos
                               AND t.fecha_operacion = pg.fecha_operacion
   WHERE pg.fecha_operacion = fecha_guatemala() AND pg.estado = 'APLICADO' AND t.id IS NULL;

  -- Mismo voucher con montos distintos
  SELECT array_agg(t.referencia_pos) INTO v_diferencia
    FROM pos_transaccion t
    JOIN pago pg ON pg.terminal_pos = t.terminal_pos AND pg.referencia_pos = t.referencia_pos
                AND pg.fecha_operacion = t.fecha_operacion AND pg.estado = 'APLICADO'
   WHERE t.fecha_operacion = fecha_guatemala() AND t.monto <> pg.monto;

  IF v_sin_pedido IS DISTINCT FROM ARRAY['777777'] THEN
    RAISE EXCEPTION 'FALLA caso 7: POS sin pedido = % (se esperaba 777777)', v_sin_pedido;
  END IF;
  IF v_sin_pos <> 0 THEN
    RAISE EXCEPTION 'FALLA caso 7: hay % pagos con tarjeta sin POS (se esperaba 0)', v_sin_pos;
  END IF;
  IF v_diferencia IS DISTINCT FROM ARRAY['900001'] THEN
    RAISE EXCEPTION 'FALLA caso 7: diferencias = % (se esperaba 900001)', v_diferencia;
  END IF;

  -- Importar el mismo cierre dos veces no lo duplica
  BEGIN
    INSERT INTO pos_transaccion (centro_venta_id, fecha_operacion, terminal_pos, referencia_pos, monto)
    VALUES (1, fecha_guatemala(), 'TERM-01', '458712', 126.00);
    RAISE EXCEPTION 'FALLA caso 7: permitió importar dos veces la misma transacción del POS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALLA%' THEN RAISE; END IF;
    IF SQLSTATE <> '23505' THEN
      RAISE EXCEPTION 'FALLA caso 7: error inesperado: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK  caso 7 · conciliación: 777777 sin pedido, 900001 con diferencia de monto, 458712 cuadra; no se duplica al reimportar';
END $$;

DO $$ BEGIN RAISE NOTICE '===== LOS 7 CASOS PASARON ====='; END $$;

ROLLBACK;  -- la base queda como estaba
