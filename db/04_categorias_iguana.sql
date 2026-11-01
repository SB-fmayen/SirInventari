-- Categorías del menú público https://shukoslaiguana.com/
-- Consultado el 2026-11-01. Se conservan los nombres publicados, incluido ENRROLLADOS.
-- Solo carga datos; no cambia tablas, triggers ni funciones.
-- Repetir la carga no duplica categorías, incluso si ya existen con otras mayúsculas.
BEGIN;
SET LOCAL search_path TO ventas;
LOCK TABLE categoria IN SHARE ROW EXCLUSIVE MODE;

WITH categorias_menu (nombre, orden) AS (
  VALUES
    ('LASAÑA', 1),
    ('ENTRADAS', 2),
    ('HAMBURGUESAS', 3),
    ('PIZZAS PERSONALES', 4),
    ('PIZZAS GRANDES', 5),
    ('DON CALZONE', 6),
    ('ENRROLLADOS', 7),
    ('CONO PIZZA', 8),
    ('TORTILLAS DE HARINA', 9),
    ('SHUKOS', 10),
    ('EXTRAS', 11),
    ('BEBIDAS', 12)
), orden_actualizado AS (
  UPDATE categoria c
     SET orden = m.orden
    FROM categorias_menu m
   WHERE lower(btrim(c.nombre)) = lower(m.nombre)
     AND c.orden <> m.orden
  RETURNING c.id
)
INSERT INTO categoria (nombre, orden)
SELECT m.nombre, m.orden
  FROM categorias_menu m
 WHERE NOT EXISTS (
   SELECT 1 FROM categoria c WHERE lower(btrim(c.nombre)) = lower(m.nombre)
 );

COMMIT;
