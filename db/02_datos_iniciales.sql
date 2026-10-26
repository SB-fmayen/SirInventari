SET search_path TO ventas;

-- ===================== 1. Datos iniciales =====================
INSERT INTO centro_venta (codigo, nombre) VALUES
  ('CV01', 'Centro de venta 1'),
  ('CV02', 'Centro de venta 2');

INSERT INTO tipo_venta (codigo, nombre) VALUES
  ('MESA',      'Consumo en mesa'),
  ('LLEVAR',    'Para llevar'),
  ('DOMICILIO', 'Entrega a domicilio'),
  ('APP',       'App de terceros');

INSERT INTO metodo_pago (codigo, nombre, requiere_referencia) VALUES
  ('EFECTIVO', 'Efectivo',              FALSE),
  ('TARJETA',  'Tarjeta (POS externo)', TRUE),
  ('TRANSFER', 'Transferencia',         TRUE);

INSERT INTO usuario (firebase_uid, nombre, email, rol) VALUES
  ('uid-mesero-01', 'Ana Mesera',  'ana@ejemplo.com',  'MESERO'),
  ('uid-cajero-01', 'Luis Cajero', 'luis@ejemplo.com', 'CAJERO');
INSERT INTO usuario_centro VALUES (1, 1), (2, 1);

INSERT INTO dispositivo (centro_venta_id, codigo, nombre, tipo) VALUES
  (1, 'CAJA1', 'Caja principal CV01',  'CAJA'),
  (1, 'TAB01', 'Tablet mesero 1 CV01', 'TABLET');

INSERT INTO categoria (nombre) VALUES ('Platos'), ('Bebidas');
INSERT INTO producto (categoria_id, sku, nombre, precio_base) VALUES
  (1, 'PLT-001', 'Plato del día', 45.00),
  (2, 'BEB-001', 'Refresco',      12.00);

INSERT INTO turno_caja (centro_venta_id, abierto_por, fondo_inicial) VALUES (1, 2, 200.00);
