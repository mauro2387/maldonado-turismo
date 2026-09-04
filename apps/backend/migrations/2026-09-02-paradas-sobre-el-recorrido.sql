-- Las paradas, puestas sobre el recorrido; y qué recorrido para en cuál.
--
-- Dos problemas que tenían la misma solución.
--
-- 1. LA PARADA CAÍA EN UNA CALLE POR LA QUE NO PASA EL ÓMNIBUS.
--
--    La coordenada se deducía del punto medio entre las dos posiciones entre
--    las que el coche cruzó la parada, y la mediana de esos puntos medios
--    sobre todos los cruces. Es correcto pero grueso: el punto medio de dos
--    posiciones separadas por 300 m de calle curva cae adentro de la manzana,
--    no sobre la calle, y la mediana de varios puntos así queda en el medio de
--    la nada. Medido: la mitad de las paradas con más de 147 m de dispersión.
--
--    Ahora que el recorrido de cada línea es el que publica la empresa, el
--    cálculo se hace **sobre el recorrido**: en vez de promediar dos puntos en
--    el plano, se proyectan las dos posiciones sobre el trazo y se promedia la
--    distancia recorrida, que es un número. La mediana de esas distancias
--    devuelve un punto que está sobre la calle por definición.
--
-- 2. NO SE SABÍA QUÉ LÍNEA PARA EN CADA PARADA.
--
--    Se deducía por cercanía: una parada a menos de 40 m del trazo se daba por
--    servida por esa línea. En una avenida con cantero, o en el centro donde
--    tres líneas comparten cuadra, eso reparte paradas equivocadas.
--
--    Pero el feed lo dice literalmente: si un coche de la 12 informa que acaba
--    de pasar la parada 139, la 12 para en la 139. Eso es dato de la empresa,
--    no una inferencia geométrica, y de paso viene con el orden -la distancia
--    sobre el trazo- que necesitan las ETAs y el planificador.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. De dónde salió la coordenada de cada parada.
--
--    `spread_m` cambia de significado según esto: en 'cruces' es la dispersión
--    de los puntos medios en el plano, y en 'recorrido' es la dispersión de
--    las distancias sobre el trazo, que es mucho más chica porque no arrastra
--    el ancho de la calle ni el error transversal del GPS.
-- ---------------------------------------------------------------------------
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS placement varchar(16);

COMMENT ON COLUMN bus_stops.placement IS
  'recorrido = proyectada sobre el trazo publicado de la línea; cruces = mediana de los puntos medios entre posiciones';

-- ---------------------------------------------------------------------------
-- 2. Qué paradas hace cada recorrido, y en qué orden.
--
--    La clave es (empresa, línea, itinerario, parada), la misma identidad con
--    la que se guardan los trazos en route_shapes. `along_m` es la distancia
--    desde el arranque del recorrido hasta la parada: con eso se ordena, se
--    sabe si un ómnibus ya pasó y se calcula cuánto falta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itinerary_stops (
  operator      varchar(40) NOT NULL,
  line_code     varchar(20) NOT NULL,
  itinerary_key varchar(120) NOT NULL,
  stop_id       integer NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,

  -- Metros de recorrido desde el inicio del trazo hasta la parada.
  along_m       double precision NOT NULL,
  -- 1 = primera parada del recorrido. Se recalcula en cada reconstrucción.
  sequence      integer NOT NULL,
  -- Cuántos cruces del feed sostienen esta parada en este recorrido. Uno solo
  -- puede ser un coche desviado; con varios ya es el recorrido.
  samples       integer NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (operator, line_code, itinerary_key, stop_id)
);

CREATE INDEX IF NOT EXISTS itinerary_stops_stop_idx ON itinerary_stops (stop_id);
CREATE INDEX IF NOT EXISTS itinerary_stops_orden_idx
  ON itinerary_stops (operator, line_code, itinerary_key, sequence);

COMMENT ON TABLE itinerary_stops IS
  'Paradas de cada recorrido en orden, deducidas de la parada que informa el propio feed AVL';

COMMIT;
