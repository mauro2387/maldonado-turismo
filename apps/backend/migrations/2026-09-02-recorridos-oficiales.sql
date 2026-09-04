-- Los recorridos que publican las propias empresas.
--
-- Hasta acá el trazo de cada línea se reconstruía con el GPS: se tomaba un
-- viaje, se lo pasaba por un ruteador y se lo validaba contra los demás
-- viajes. Funciona, pero tiene un techo. El feed publica cada 30 s, así que
-- entre dos posiciones hay 300 m de calle sobre los que el ruteador decide
-- solo, y cuando decide mal el mapa dibuja una vuelta manzana que el ómnibus
-- no hace. Once itinerarios quedaban además por debajo del corte de calidad y
-- directamente no se dibujaban.
--
-- Resulta que no hacía falta deducir nada: **las tres empresas publican sus
-- recorridos dibujados**, en Google My Maps, y esos mapas se descargan en KML.
--
--   CODESA              www.codesa.com.uy/p/recorridos.html      31 mapas
--   Maldonado Turismo   maldonadoturismo.com/recorridos/         mapas por línea
--   Micro Ltda          microltda.com/recorridos                 ida y vuelta por línea
--
-- Cada mapa trae la polilínea trazada sobre las calles reales, con 500 a 950
-- puntos, y viene nombrada por la empresa: "Línea 12 (ida) CODESA", "Línea 24
-- (ida desde agencia por Lavagna) CODESA". Es el recorrido oficial, no una
-- estimación, y encima resuelve el problema de los itinerarios: la 24 tiene
-- sus cuatro variantes publicadas por separado.
--
-- CODESA y Maldonado Turismo publican además el recorrido calle por calle en
-- texto ("Agencia Maldonado, Av. Batlle y Ordoñez, Francisco Martínez, ...") y
-- las pasadas de interés. Eso se guarda igual: es lo que permite escribir "va
-- por Roosevelt" sin inventarlo, y sirve de control cruzado del trazo.
--
-- El GPS no se va: sigue siendo lo que dice **qué unidad está haciendo cuál de
-- estos recorridos** y lo que mide si el trazo publicado sigue vigente.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. El recorrido publicado.
--
--    La identidad es (empresa, línea, variante). La variante sale del nombre
--    que le puso la empresa al mapa —"ida", "vuelta", "ida desde vialidad"— y
--    no de un número inventado acá: si mañana CODESA agrega una variante, cae
--    en una fila nueva sin tocar las demás.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS official_routes (
  id            serial PRIMARY KEY,
  operator      varchar(40)  NOT NULL,
  -- El código tal como lo publica la empresa. Puede no ser un número: "7/24"
  -- y "9/12" son refuerzos que combinan dos líneas, y "L48" es circular.
  line_code     varchar(20)  NOT NULL,
  variant       varchar(80)  NOT NULL,
  -- El nombre del mapa, tal cual. Es lo que la empresa eligió mostrar.
  name          varchar(200) NOT NULL,
  -- Hacia dónde va, cuando la empresa lo publica aparte ("Maldonado a Punta
  -- del Este"). Es el cartel del ómnibus, y con eso se emparejan los datos del
  -- GPS con este recorrido.
  headsign      varchar(200),

  -- La polilínea, en orden GeoJSON [lng, lat], igual que route_shapes.
  --
  -- Puede venir vacía: siete páginas de CODESA publican el recorrido en texto
  -- pero no tienen mapa (la 3, la 6, la 11, la 35, la 61, la L50 y la D). Esas
  -- líneas se siguen dibujando con la reconstrucción del GPS, y el texto vale
  -- igual para decir por dónde va y para controlar el trazo.
  geometry      jsonb,
  distance_m    double precision,

  -- El recorrido calle por calle, como lo publica la empresa. Texto plano
  -- separado por comas; no se parsea acá, se guarda como vino.
  street_text   text,
  -- "Pasadas de Interés": Terminal, Shopping, Hospital. Lo que la gente usa
  -- para reconocer si la línea le sirve.
  highlights    text[],

  -- De dónde salió cada fila, para poder volver a la fuente.
  source_url    text         NOT NULL,
  map_id        varchar(80),
  imported_at   timestamptz  NOT NULL DEFAULT now(),

  UNIQUE (operator, line_code, variant)
);

CREATE INDEX IF NOT EXISTS official_routes_line_idx ON official_routes (line_code);

COMMENT ON TABLE official_routes IS
  'Recorridos publicados por las empresas (Google My Maps + recorrido en texto). Fuente oficial, no reconstrucción';
COMMENT ON COLUMN official_routes.variant IS
  'ida, vuelta, ida-desde-vialidad... derivada del nombre que la empresa le puso al mapa';

-- ---------------------------------------------------------------------------
-- 2. De dónde salió cada trazo que se sirve.
--
--    `route_shapes` sigue siendo la tabla que lee la app —el mapa, el orden de
--    paradas, las ETAs y el planificador leen de ahí— pero ahora una fila
--    puede venir del recorrido publicado en vez de la reconstrucción. Las dos
--    conviven: si una línea no tiene mapa publicado, se sigue reconstruyendo.
--
--    `official_route_id` deja ver cuál es cuál sin adivinar, y `match_score`
--    guarda qué tan bien las posiciones reales de ese itinerario caen sobre el
--    recorrido publicado: es la medida que decide el emparejamiento y la que
--    avisa si la empresa cambió el recorrido y no actualizó el mapa.
-- ---------------------------------------------------------------------------
ALTER TABLE route_shapes ADD COLUMN IF NOT EXISTS source            varchar(16) NOT NULL DEFAULT 'avl';
ALTER TABLE route_shapes ADD COLUMN IF NOT EXISTS official_route_id integer REFERENCES official_routes(id) ON DELETE SET NULL;
ALTER TABLE route_shapes ADD COLUMN IF NOT EXISTS match_score       double precision;

COMMENT ON COLUMN route_shapes.source IS
  'oficial = polilínea publicada por la empresa; avl = reconstruida desde las posiciones GPS';
COMMENT ON COLUMN route_shapes.match_score IS
  'Proporción de las posiciones reales del itinerario que caen sobre el recorrido publicado (0..1)';

COMMIT;
