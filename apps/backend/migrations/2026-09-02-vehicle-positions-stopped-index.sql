-- Índice para el cálculo de "hace cuánto que está detenido" en
-- /transport/vehicles.
--
-- El endpoint se pide cada 5 segundos por cliente y hace dos recorridas de
-- vehicle_positions: el DISTINCT ON que saca la última posición de cada coche,
-- y el agregado nuevo que busca su último registro en movimiento. Las dos
-- ordenan por (vehicle_id, recorded_at) y hasta ahora solo existía un índice
-- por vehicle_id solo, así que ambas terminaban ordenando a mano.
--
-- La tabla guarda 24 h de histórico a razón de un registro por ómnibus cada
-- pocos segundos: son cientos de miles de filas, no un puñado.

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_recorded
  ON vehicle_positions (vehicle_id, recorded_at DESC);
