-- =====================================================
-- Dónde para el ómnibus, observado y no deducido
-- =====================================================
--
-- El catálogo de paradas (código y nombre) sale del feed AVL y eso está bien:
-- lo publica la empresa. Lo que estaba flojo era la **coordenada**, que se
-- deducía del intervalo entre las dos posiciones entre las que el coche cruzó
-- la parada. Medido contra los nodos de OpenStreetMap el 2026-09-04: error
-- mediano de 57 m, p90 de 176 m. A 57 m uno está en la otra esquina, y a 176 m
-- en la otra cuadra. De ahí el reclamo de que la app manda a esperar donde el
-- ómnibus no para.
--
-- Hay una observación mucho más directa en el mismo feed y se estaba tirando:
-- **cuando el coche informa que acaba de pasar la parada X y además está
-- detenido, ese punto es la parada**. No es una interpolación, es el ómnibus
-- parado en la parada levantando gente. Medido contra los mismos nodos de OSM:
-- error mediano de 15 m.
--
-- El problema es que `vehicle_positions` se poda a las 24 h y con ella se
-- borraba la evidencia. Esta tabla la guarda. Cada fila es un avistamiento; la
-- posición de la parada es un resumen de todos los suyos, y mejora sola con los
-- días sin que nadie corra nada.
--
-- Ver también 2026-09-02-paradas-desde-avl.sql (de dónde salen código y
-- nombre) y 2026-09-02-paradas-sobre-el-recorrido.sql (el estimador anterior,
-- que sigue siendo el respaldo de las paradas sin avistamientos).

-- -----------------------------------------------------
-- Avistamientos
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS stop_observations (
  id BIGSERIAL PRIMARY KEY,

  -- La parada, con la misma clave que el catálogo: código + nombre. No
  -- (operator, code), porque las tres empresas comparten casi toda la
  -- numeración y juntar sus muestras es justamente lo que da precisión.
  code           VARCHAR(16)  NOT NULL,
  name           VARCHAR(160) NOT NULL,

  -- Quién la vio y haciendo qué recorrido. Hace falta para proyectar el
  -- avistamiento sobre el trazo correcto: la misma parada vista desde la ida y
  -- desde la vuelta cae en dos lugares distintos del mismo trazo.
  operator       VARCHAR(40)  NOT NULL,
  vehicle_id     VARCHAR(60)  NOT NULL,
  line_code      VARCHAR(16),
  itinerary_key  VARCHAR(160),

  latitude       DOUBLE PRECISION NOT NULL,
  longitude      DOUBLE PRECISION NOT NULL,

  -- Velocidad en km/h en el momento del avistamiento. Es lo que separa "el
  -- coche está en la parada" de "el coche ya pasó la parada y sigue viaje": por
  -- debajo de 5 km/h el ómnibus está frenando o parado, y su posición es la
  -- parada con un error de metros.
  speed_kmh      DOUBLE PRECISION,

  -- Cuántas muestras pasaron desde que el coche informó esta parada por
  -- primera vez. 1 es la muestra en la que cambió el cartel de "parada
  -- anterior"; 2 y 3 son las siguientes, que todavía pueden caer dentro de la
  -- detención. Más arriba de eso el coche ya se fue.
  since_change   SMALLINT     NOT NULL,

  observed_at    TIMESTAMPTZ  NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Idempotencia: el recolector relee las últimas horas de posiciones cada vez
  -- que corre, así que tiene que poder reinsertar sin duplicar.
  CONSTRAINT stop_observations_unicas UNIQUE (operator, vehicle_id, observed_at, code)
);

-- El resumen por parada lee siempre por (código, nombre) y filtra por
-- velocidad: este índice es el que hace que la reconstrucción entera sea un
-- solo barrido.
CREATE INDEX IF NOT EXISTS idx_stop_observations_parada
  ON stop_observations (code, name, speed_kmh);

CREATE INDEX IF NOT EXISTS idx_stop_observations_recorrido
  ON stop_observations (operator, line_code, itinerary_key);

-- Para la poda: se conservan los mejores avistamientos de cada parada.
CREATE INDEX IF NOT EXISTS idx_stop_observations_fecha
  ON stop_observations (observed_at);

COMMENT ON TABLE stop_observations IS
  'Avistamientos de ómnibus detenidos en una parada, extraídos del feed AVL. '
  'Sobreviven a la poda de vehicle_positions porque son la evidencia de dónde '
  'está cada parada.';

-- -----------------------------------------------------
-- Procedencia y precisión de cada parada
-- -----------------------------------------------------
--
-- `spread_m` ya decía cuánta calle quedaba sin descartar, pero es una medida de
-- **precisión** (cuán juntas están las muestras), no de **exactitud** (cuán
-- cerca está la respuesta de la parada de verdad). Las dos columnas nuevas
-- dicen de dónde salió la coordenada y con qué error se la puede afirmar,
-- calibrado contra OpenStreetMap.
ALTER TABLE bus_stops
  ADD COLUMN IF NOT EXISTS fix_source  VARCHAR(24),
  ADD COLUMN IF NOT EXISTS accuracy_m  INTEGER,
  ADD COLUMN IF NOT EXISTS osm_node_id BIGINT,
  ADD COLUMN IF NOT EXISTS fixed_at    TIMESTAMPTZ;

COMMENT ON COLUMN bus_stops.fix_source IS
  'De dónde salió la coordenada, de más a menos firme: manual (corregida a '
  'mano), osm (nodo relevado en OpenStreetMap que coincide con lo medido), '
  'detenciones (mediana de ómnibus detenidos en la parada), intervalo '
  '(interpolada entre dos posiciones), ninguna.';

COMMENT ON COLUMN bus_stops.accuracy_m IS
  'Radio en metros dentro del cual está la parada de verdad, calibrado contra '
  'OpenStreetMap. La app no manda a esperar a una parada cuyo radio no permita '
  'afirmar la esquina.';

-- Buscar paradas usables cerca de un punto es la consulta más caliente de la
-- app: filtra por activa y por precisión antes de medir distancias.
CREATE INDEX IF NOT EXISTS idx_bus_stops_usables
  ON bus_stops (is_active, accuracy_m);

-- -----------------------------------------------------
-- Paradas relevadas en OpenStreetMap
-- -----------------------------------------------------
--
-- No son el catálogo -OSM no tiene ni los códigos ni todas las paradas- sino
-- una segunda opinión independiente sobre dónde está cada una, y la única que
-- viene de alguien que estuvo parado ahí. Se guardan aparte para poder
-- reimportarlas sin tocar el catálogo, y para poder medir contra ellas.
CREATE TABLE IF NOT EXISTS osm_bus_stops (
  osm_id     BIGINT PRIMARY KEY,
  name       VARCHAR(160),
  ref        VARCHAR(32),
  latitude   DOUBLE PRECISION NOT NULL,
  longitude  DOUBLE PRECISION NOT NULL,
  shelter    BOOLEAN,
  bench      BOOLEAN,
  lighting   BOOLEAN,
  tags       JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE osm_bus_stops IS
  'Paradas relevadas en OpenStreetMap (ODbL). Segunda opinión sobre la '
  'coordenada y única fuente de si la parada tiene refugio o banco.';
