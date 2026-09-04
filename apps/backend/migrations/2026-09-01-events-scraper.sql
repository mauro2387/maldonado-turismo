-- Migración: ingesta automática de la agenda de eventos del departamento
-- Fecha: 2026-09-01
--
-- La tabla events se cargaba únicamente a mano desde el backoffice. Se le
-- agrega la trazabilidad mínima para poder rellenarla todos los días desde
-- las agendas públicas (IDM, prensa local, portal de turismo) sin pisar lo
-- que carga el equipo de Cultura ni duplicar la misma actividad cada vez que
-- vuelve a aparecer publicada.

-- ---------------------------------------------------------------------------
-- Trazabilidad del origen en events
-- ---------------------------------------------------------------------------

ALTER TABLE events
  -- Clave del scraper que trajo la fila ('maldonado-gub', 'cadena-del-mar',
  -- ...). NULL = cargado a mano en el backoffice.
  ADD COLUMN IF NOT EXISTS source varchar(50),
  -- Identificador estable dentro de esa fuente (el nodo de Drupal, el id de
  -- la nota, el id del post de WordPress). Junto con source forma la clave
  -- natural del upsert.
  ADD COLUMN IF NOT EXISTS source_id varchar(120),
  ADD COLUMN IF NOT EXISTS source_url text,
  -- Localidad normalizada (Punta del Este, La Barra, Manantiales, ...). Se
  -- deduce del texto y es lo que usa el filtro por balneario del frontend.
  ADD COLUMN IF NOT EXISTS locality varchar(80),
  -- Qué tan seguro quedó el parseo de la fecha (0..1). Por debajo del umbral
  -- el evento entra como 'pending' para que alguien lo revise.
  ADD COLUMN IF NOT EXISTS source_confidence numeric(3, 2),
  -- 'published' se muestra en la app, 'pending' espera revisión humana,
  -- 'rejected' quedó descartado y no se vuelve a proponer.
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS scraped_at timestamptz,
  -- Marca lo tocado a mano: el scraper no vuelve a sobrescribir una fila que
  -- un editor corrigió.
  ADD COLUMN IF NOT EXISTS edited_by_admin boolean NOT NULL DEFAULT false;

-- Un mismo evento no puede entrar dos veces por la misma fuente. El índice es
-- parcial porque las filas cargadas a mano tienen source NULL.
CREATE UNIQUE INDEX IF NOT EXISTS events_source_unique
  ON events (source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_start_date_idx ON events (start_date);
CREATE INDEX IF NOT EXISTS events_status_idx ON events (status);
CREATE INDEX IF NOT EXISTS events_locality_idx ON events (locality);

-- ---------------------------------------------------------------------------
-- Fuentes configurables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS event_sources (
  key varchar(50) PRIMARY KEY,
  name varchar(120) NOT NULL,
  url text NOT NULL,
  -- Apagar una fuente sin tocar código, por si un sitio cambia de HTML y
  -- empieza a traer basura.
  enabled boolean NOT NULL DEFAULT true,
  -- Cuántas páginas del listado recorrer en cada pasada.
  max_pages smallint NOT NULL DEFAULT 3,
  last_run_at timestamptz,
  last_status varchar(20),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Historial de corridas, para poder ver desde el backoffice si la tarea
-- diaria efectivamente corrió y qué trajo.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS event_scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- 'running' | 'ok' | 'partial' | 'error'
  status varchar(20) NOT NULL DEFAULT 'running',
  -- 'schedule' (tarea diaria) | el email del admin que apretó el botón
  triggered_by varchar(120) NOT NULL DEFAULT 'schedule',
  items_found integer NOT NULL DEFAULT 0,
  items_created integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  items_skipped integer NOT NULL DEFAULT 0,
  -- Detalle por fuente: encontrados, creados, actualizados y error si hubo.
  detail jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS event_scrape_runs_started_idx
  ON event_scrape_runs (started_at DESC);

INSERT INTO event_sources (key, name, url, max_pages) VALUES
  ('maldonado-gub', 'Intendencia de Maldonado - Eventos', 'https://www.maldonado.gub.uy/eventos', 4),
  ('cadena-del-mar', 'Cadena del Mar - Eventos', 'https://cadenadelmar.uy/eventos', 3),
  ('maldonado-turismo', 'Maldonado Turismo - Eventos', 'https://maldonadoturismo.com.uy', 1)
ON CONFLICT (key) DO NOTHING;
