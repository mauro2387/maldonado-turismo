-- Migración: campos de tiempo real provenientes de los feeds GPS de las empresas
-- Fecha: 2026-09-01
--
-- Los feeds AVL de CODESA y Maldonado Turismo publican bastante más que una
-- coordenada (línea, destino, próxima parada, ocupación, puntualidad). Estas
-- columnas guardan eso para que la app pueda mostrarlo sin volver a consultar.
--
-- Nota: los campos de conductor que publica el feed de Maldonado Turismo
-- (con / cnm) son datos personales y NO se ingestan (Ley 18.331).

ALTER TABLE vehicle_positions
  ADD COLUMN IF NOT EXISTS operator VARCHAR(50),
  ADD COLUMN IF NOT EXISTS line_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS line_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS direction SMALLINT,
  ADD COLUMN IF NOT EXISTS plate VARCHAR(20),
  ADD COLUMN IF NOT EXISTS accessible BOOLEAN,
  ADD COLUMN IF NOT EXISTS occupancy_pct SMALLINT,
  ADD COLUMN IF NOT EXISTS schedule_deviation_min SMALLINT,
  ADD COLUMN IF NOT EXISTS prev_stop_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS prev_stop_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS next_stop_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS next_stop_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS departure_time VARCHAR(10),
  ADD COLUMN IF NOT EXISTS fix_time TIMESTAMPTZ;

-- fix_time es el momento del reporte GPS según la empresa; recorded_at es
-- cuándo lo guardamos nosotros. Los dos sirven: el primero para mostrar
-- antigüedad real del dato, el segundo para depurar la ingesta.

-- El poller corre cada pocos segundos y el feed repite el último fix mientras
-- el ómnibus no reporta uno nuevo. Este índice hace que esas repeticiones
-- caigan solas por ON CONFLICT DO NOTHING en vez de inflar la tabla.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_fix
  ON vehicle_positions(vehicle_id, fix_time)
  WHERE fix_time IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_operator ON vehicle_positions(operator);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_line_code ON vehicle_positions(line_code);

-- La ingesta enlaza la línea que publica la empresa con bus_routes a través
-- de este código (la entidad BusRoute ya lo declara). Mientras esté vacío las
-- posiciones entran con route_id null y la app muestra igual line_code.
ALTER TABLE bus_routes
  ADD COLUMN IF NOT EXISTS code VARCHAR(20);
