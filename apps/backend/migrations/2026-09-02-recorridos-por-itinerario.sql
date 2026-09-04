-- Un recorrido por itinerario, no por línea.
--
-- El error: `route_shapes` estaba identificada por (operator, line_code,
-- direction), y `direction` sale del campo `sen` del feed AVL, que **es
-- siempre 1**. O sea que había un único trazo por línea, y se le aplicaba a
-- todos los ómnibus de esa línea.
--
-- El campo que sí identifica el itinerario es `tra`, que el feed publica y que
-- se estaba descartando. Se ve claro cruzándolo con `lnm`, el destino:
--
--   lin=9   tra=1 -> "PUNTA DEL ESTE"        tra=2 -> "MALDONADO"
--   lin=24  tra=3 -> "P. DEL ESTE DE VIAL"   tra=5 -> "P. DEL ESTE DE AG X LAV"
--           tra=4 -> "SAN CARLOS A VIAL."    tra=6 -> "SAN CARLOS A AG X LAV"
--
-- La línea 24 hace cuatro recorridos por calles distintas —"de Vial" y "Ag x
-- Lavagna" son avenidas diferentes— y los cuatro compartían el mismo trazo.
-- De ahí que el mapa dibujara líneas por calles por las que el ómnibus no
-- pasa: no era un error de reconstrucción, era el trazo de otro itinerario.
--
-- Medido el 2026-09-02 sobre las posiciones guardadas: 31 líneas, **73
-- itinerarios**. 25 de las 31 líneas tienen más de uno.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. El itinerario en las posiciones.
--
--    `line_name` ya se guardaba y alcanza para separar los itinerarios de los
--    datos que ya están (es el `lnm` del feed). `itinerary` guarda el `tra`,
--    que es el identificador propio de la empresa: no cambia si un día
--    reescriben el cartel del destino, y no viene recortado como algunos
--    nombres ("Baln. Bs. As. - Maldonado (por").
-- ---------------------------------------------------------------------------
ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS itinerary smallint;

COMMENT ON COLUMN vehicle_positions.itinerary IS
  'Campo tra del feed AVL: qué recorrido de la línea está haciendo la unidad';
COMMENT ON COLUMN vehicle_positions.direction IS
  'Campo sen del feed AVL. Las tres empresas lo publican siempre en 1: no separa ida de vuelta, para eso está itinerary';

-- Reconstruir agrupa por línea + itinerario y recorre la traza en orden.
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_itinerario
  ON vehicle_positions (operator, line_code, line_name, vehicle_id, departure_time);

-- ---------------------------------------------------------------------------
-- 2. El itinerario en los recorridos.
--
--    `itinerary_key` es la identidad: el `tra` cuando está, y si no el nombre
--    del destino normalizado. Se guarda además `itinerary_name` para poder
--    mostrar "Punta del Este - Cerro Pelado" en vez de un número.
-- ---------------------------------------------------------------------------
ALTER TABLE route_shapes ADD COLUMN IF NOT EXISTS itinerary_key  varchar(120);
ALTER TABLE route_shapes ADD COLUMN IF NOT EXISTS itinerary_name varchar(200);
ALTER TABLE route_shapes ADD COLUMN IF NOT EXISTS itinerary      smallint;

-- Cuántos viajes independientes respaldan el trazo y qué tan bien lo hacen.
-- `confidence` guardaba lo que reportaba el map matching -null en la práctica,
-- porque se usa /route y no /match-. Ahora guarda una medida propia: ver
-- route-shapes.service.ts.
ALTER TABLE route_shapes ADD COLUMN IF NOT EXISTS support        double precision;
ALTER TABLE route_shapes ADD COLUMN IF NOT EXISTS trips_used     integer;
ALTER TABLE route_shapes ADD COLUMN IF NOT EXISTS trips_total    integer;

COMMENT ON COLUMN route_shapes.confidence IS
  'Fidelidad: proporción del trazo que pisa calle con posiciones reales cerca (0..1)';
COMMENT ON COLUMN route_shapes.support IS
  'Respaldo: proporción de las posiciones de OTROS viajes del itinerario que caen sobre el trazo (0..1)';

-- ---------------------------------------------------------------------------
-- 3. La identidad cambia, así que el índice único también.
--
--    Los trazos viejos se borran en vez de migrarse: están keyeados por línea
--    y no hay forma de saber a qué itinerario correspondía cada uno. Se
--    reconstruyen todos desde las posiciones, que es de donde salen.
-- ---------------------------------------------------------------------------
DELETE FROM route_shapes;

DROP INDEX IF EXISTS idx_route_shapes_line;

ALTER TABLE route_shapes ALTER COLUMN itinerary_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_shapes_itinerario
  ON route_shapes (operator, line_code, itinerary_key);

CREATE INDEX IF NOT EXISTS idx_route_shapes_line
  ON route_shapes (line_code);

COMMIT;
