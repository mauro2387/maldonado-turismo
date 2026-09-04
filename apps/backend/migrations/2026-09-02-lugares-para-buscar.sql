-- Los lugares con los que la gente dice a dónde va.
--
-- El buscador de destinos miraba dos cosas: las 28 fichas turísticas de
-- `places` y los nombres de las paradas. Con eso, "cómo llego al Punta
-- Shopping", "al hospital", "a la terminal" o "al liceo 3" no encontraban
-- nada y la pantalla quedaba en blanco. Son los destinos más buscados del
-- departamento y ninguno es un atractivo turístico.
--
-- OpenStreetMap tiene mapeados 2.800 lugares con nombre en Maldonado —
-- comercios, hospitales, liceos, hoteles, plazas, barrios—, con licencia ODbL
-- y fuente citable. Se importan a esta tabla y el buscador los usa junto con
-- las paradas y los atractivos: cada fila conserva su id de OSM, así que se
-- puede volver a la fuente y volver a importar sin duplicar.
--
-- No reemplaza a `places`: ahí van las fichas con foto y descripción que
-- escribe la Intendencia. Esto es el índice para buscar un destino.

BEGIN;

CREATE TABLE IF NOT EXISTS geo_places (
  id           serial PRIMARY KEY,

  name         varchar(200) NOT NULL,
  -- El mismo nombre en minúsculas y sin acentos, que es como se busca. Se
  -- guarda calculado en vez de normalizar en cada consulta: `unaccent` no es
  -- inmutable y no se puede indexar, y una función propia para esto sería
  -- arrastrar una extensión por una comparación de texto.
  search_name  varchar(200) NOT NULL,
  -- Qué es: 'hospital', 'liceo', 'shopping', 'plaza', 'barrio'... En
  -- castellano y agrupado, no la etiqueta cruda de OSM: es lo que se muestra
  -- debajo del nombre en la lista de resultados.
  kind         varchar(40)  NOT NULL,
  -- La etiqueta original, para poder revisar de dónde salió la clasificación.
  osm_tag      varchar(80),

  lat          double precision NOT NULL,
  lng          double precision NOT NULL,

  -- Barrio o localidad, cuando se puede saber. Dos "Farmacia San Roque" se
  -- distinguen por esto.
  locality     varchar(120),

  /**
   * Cuánto pesa en el orden de los resultados, de 0 a 1. No es popularidad
   * -no hay con qué medirla- sino cuán probable es que alguien lo escriba
   * como destino: una terminal de ómnibus pesa más que una peluquería.
   */
  importance   double precision NOT NULL DEFAULT 0.3,

  source       varchar(16) NOT NULL DEFAULT 'osm',
  osm_type     varchar(8),
  osm_id       bigint,
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (osm_type, osm_id)
);

CREATE INDEX IF NOT EXISTS geo_places_name_idx ON geo_places (search_name varchar_pattern_ops);
CREATE INDEX IF NOT EXISTS geo_places_kind_idx ON geo_places (kind);
CREATE INDEX IF NOT EXISTS geo_places_lat_lng_idx ON geo_places (lat, lng);

COMMENT ON TABLE geo_places IS
  'Índice de lugares con nombre para buscar destinos. Importado de OpenStreetMap (ODbL) con src/scripts/import-osm-places.ts';

COMMIT;
