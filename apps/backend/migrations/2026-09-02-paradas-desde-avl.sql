-- Paradas reales, reconstruidas desde los feeds AVL de las empresas.
--
-- Hasta ahora `bus_stops` tenía ocho filas de relleno —"Plaza Maldonado",
-- "Casapueblo"— con líneas inventadas ("Línea 1" a "Línea 5") y coordenadas
-- redondeadas. Sobre eso no se podía construir Moverse: la pantalla entera
-- pregunta "¿qué sale de las paradas que tengo alrededor?" y no había paradas.
--
-- La fuente real estaba a la vista. El XML AVL que ya se ingesta publica, en
-- cada posición, la parada por la que el coche acaba de pasar:
--
--   <p1c>139</p1c><p1n>SAN CARLOS</p1n>   (parada anterior: código y nombre)
--   <p2c>140</p2c><p2n>L OLIVERA</p2n>    (próxima; solo CODESA y Micro)
--
-- O sea que el catálogo de paradas de CODESA, Maldonado Turismo y Micro ya
-- viene en el feed, con sus códigos y sus nombres oficiales. Lo único que no
-- trae es la coordenada, y esa se deduce: cuando entre dos posiciones
-- consecutivas del mismo coche la parada anterior cambia de W a X, el coche
-- cruzó X en ese intervalo, así que X está entre las dos. La mediana de todos
-- los cruces registrados converge a la parada.
--
-- Es el mismo método con el que ya se arman los recorridos en `route_shapes`,
-- y por eso cada fila guarda de dónde salió: `source`, `operators`, `samples`
-- y `spread_m`. Nada de esto es contenido inventado —el nombre y el código son
-- de la empresa— pero la coordenada es una estimación y la fila lo dice.
--
-- Esta migración solo prepara la tabla. El catálogo lo escribe
-- StopCatalogService (src/modules/transporte/stop-catalog.service.ts), que
-- puede volver a correrse en cualquier momento y mejora a medida que se
-- acumulan posiciones.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Las columnas que la entidad TypeORM siempre describió y la tabla nunca
--    tuvo. Su ausencia hacía que GET /transport/stops/:id respondiera 500:
--    TypeORM pedía stop.code, stop.zone, stop.is_active y Postgres cortaba con
--    "column does not exist".
-- ---------------------------------------------------------------------------
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS code            varchar(20);
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS description     text;
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS zone            varchar(100);
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS has_shelter     boolean NOT NULL DEFAULT false;
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS has_bench       boolean NOT NULL DEFAULT false;
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS has_lighting    boolean NOT NULL DEFAULT false;
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS accessibility   boolean NOT NULL DEFAULT false;
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS qr_code_id      integer;
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS is_active       boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2. Procedencia. Una parada cargada a mano por la Intendencia y una deducida
--    del feed no valen lo mismo, y la reconstrucción no puede pisar la carga
--    manual: `source` es lo que separa las dos cosas.
-- ---------------------------------------------------------------------------
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS source          varchar(16) NOT NULL DEFAULT 'manual';
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS operators       text[];
-- Cuántos cruces sostienen la coordenada y qué tan dispersos están (p90-p10).
-- Con pocas muestras la parada existe igual —el código y el nombre son de la
-- empresa— pero su posición todavía no es para dibujar.
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS samples         integer;
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS spread_m        integer;
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS avl_updated_at  timestamptz;

COMMENT ON COLUMN bus_stops.source IS
  'manual = cargada por la Intendencia; avl = deducida del feed de las empresas';
COMMENT ON COLUMN bus_stops.samples IS
  'Cruces del coche registrados sobre esta parada que sostienen la coordenada';
COMMENT ON COLUMN bus_stops.spread_m IS
  'Dispersión p90-p10 de esos cruces, en metros. A más chico, mejor la posición';

-- ---------------------------------------------------------------------------
-- 3. Identidad de una parada del feed.
--
--    El código es casi siempre compartido entre empresas —de 206 códigos que
--    aparecen en más de un feed, 186 traen exactamente el mismo nombre y caen
--    a menos de 200 m—, así que la clave es el par código + nombre: las
--    empresas que coinciden se funden en una parada y las ~20 que usan el
--    mismo número para lugares distintos quedan separadas, sin inventar cuál
--    de las dos "gana".
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS bus_stops_avl_code_name_idx
  ON bus_stops (code, name)
  WHERE source = 'avl';

-- La búsqueda por cercanía filtra primero por caja para no recorrer la tabla
-- calculando cosenos.
CREATE INDEX IF NOT EXISTS bus_stops_lat_lng_idx ON bus_stops (lat, lng);
CREATE INDEX IF NOT EXISTS bus_stops_active_idx  ON bus_stops (is_active) WHERE is_active;

-- ---------------------------------------------------------------------------
-- 4. Las ocho paradas de relleno.
--
--    No se borran: se desactivan. Los identificadores 1 a 8 pueden estar
--    impresos en un QR o guardados en los favoritos de alguien, y una fila
--    inactiva devuelve la parada con su cartel de "fuera de servicio" en vez
--    de un 404 sin explicación. Dejan de aparecer en el mapa y en Moverse, que
--    es lo que importa: eran contenido inventado.
-- ---------------------------------------------------------------------------
UPDATE bus_stops
   SET is_active  = false,
       source     = 'placeholder',
       description = 'Dato de relleno anterior al catálogo real. Reemplazada por las paradas del feed AVL de las empresas.'
 WHERE source = 'manual'
   AND name IN (
     'Terminal Punta del Este', 'Plaza Artigas PDE', 'Conrad Hotel',
     'Plaza Maldonado', 'Puente La Barra', 'Manantiales',
     'José Ignacio', 'Casapueblo'
   );

COMMIT;
