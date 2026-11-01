-- Solo datos de operación comunes. No crea usuarios, centros, productos ni turnos de ejemplo.
-- Ejecutar después de 01_esquema_v0.3.sql en una base nueva, con publicación aprobada.
BEGIN;
SET LOCAL search_path TO ventas;
INSERT INTO tipo_venta (codigo, nombre) VALUES
  ('MESA', 'Consumo en mesa'), ('LLEVAR', 'Para llevar'),
  ('DOMICILIO', 'Entrega a domicilio'), ('APP', 'App de terceros')
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO metodo_pago (codigo, nombre, requiere_referencia, requiere_terminal) VALUES
  ('EFECTIVO', 'Efectivo', FALSE, FALSE),
  ('TARJETA', 'Tarjeta (POS externo)', TRUE, TRUE),
  ('TRANSFER', 'Transferencia', TRUE, FALSE)
ON CONFLICT (codigo) DO NOTHING;
COMMIT;
