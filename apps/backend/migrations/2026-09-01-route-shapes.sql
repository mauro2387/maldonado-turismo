-- Migración: recorridos de las líneas pegados a la calle
-- Fecha: 2026-09-01
--
-- OpenStreetMap prácticamente no tiene mapeadas las líneas de Maldonado (hay
-- una sola relación route=bus en todo el departamento), así que el recorrido
-- se construye a partir de las posiciones que ya ingestamos: se toma la traza
-- de un ómnibus haciendo un viaje completo y se la pasa por map matching
-- (OSRM), que devuelve la polilínea siguiendo las calles reales.
--
-- La geometría se guarda en orden GeoJSON [lng, lat], que es como la devuelve
-- OSRM y como la espera Leaflet tras invertirla.

CREATE TABLE IF NOT EXISTS route_shapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator varchar(50) NOT NULL,
  line_code varchar(20) NOT NULL,
  direction smallint,
  geometry jsonb NOT NULL,
  point_count integer NOT NULL,
  -- Metros recorridos según el motor de ruteo, para poder comparar dos
  -- reconstrucciones y quedarse con la que cubre más recorrido.
  distance_m integer,
  -- Confianza que reporta el map matching (0..1)
  confidence double precision,
  -- Viaje del que salió la traza, para poder rastrear de dónde vino
  source_vehicle_id varchar(100),
  source_departure_time varchar(10),
  source_points integer,
  built_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_shapes_line
  ON route_shapes(operator, line_code, COALESCE(direction, -1));
