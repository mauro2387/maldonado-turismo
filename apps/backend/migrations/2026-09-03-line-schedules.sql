-- =====================================================
-- Horarios publicados por las empresas
-- =====================================================
--
-- Las tres empresas (CODESA, Maldonado Turismo, Micro) publican sus horarios,
-- y hasta ahora la app no los usaba: la espera salía de las posiciones en vivo
-- y, sin unidades en la calle, de la frecuencia estimada. Eso no contesta "¿a
-- qué hora pasa el último?" ni sirve de madrugada.
--
-- Cada fila es UN servicio publicado -una salida- con las horas a las que pasa
-- por cada punto de control del recorrido (Terminal, Centro, Hospital, Punta
-- Shopping...). No es parada por parada: entre dos puntos de control la hora se
-- interpola con la distancia acumulada del recorrido, que la app ya conoce.
--
-- Regla que no se rompe: verano e invierno son documentos distintos y no se
-- mezclan. Cada fila lleva su temporada y su vigencia, y la app usa la que está
-- vigente hoy. Mostrar el horario de verano en septiembre es peor que no
-- mostrar ninguno.
--
-- El esquema GTFS que había en 2025-11-09-transport-module-complete.sql
-- (bus_trips / stop_times / service_calendars) nunca se aplicó y cuelga de
-- bus_routes, que son dos filas de ejemplo. Esta tabla es autónoma: se
-- referencia con el número del cartel de la línea, no con un id de bus_routes.

CREATE TABLE IF NOT EXISTS line_schedules (
  id SERIAL PRIMARY KEY,

  -- codesa | maldonado-turismo | micro
  operator VARCHAR(40) NOT NULL,

  -- El número del CARTEL: "17/19" (no "179"), "24" (no "L24"). Es el mismo
  -- valor que line_label en el resto de la app.
  line_label VARCHAR(20) NOT NULL,

  -- ida | vuelta | circular
  direction VARCHAR(10) NOT NULL,

  -- invierno | verano. NUNCA se mezclan al consultar.
  season VARCHAR(10) NOT NULL,

  -- Vigencia. Pueden ser NULL si el documento no la da con fecha; en ese caso
  -- vale la regla estacional que aplica el importador. `valid_text` guarda lo
  -- que dice el papel, sin interpretar ("Vigencia: Agosto 2026").
  valid_from DATE,
  valid_to DATE,
  valid_text TEXT,

  -- Qué días corre, como máscara de bits: lunes=1, martes=2, ... domingo=64.
  -- Se deriva de las referencias del papel (S = no sábados ni domingos, etc.).
  -- 127 = todos los días.
  days SMALLINT NOT NULL DEFAULT 127,

  -- Las referencias crudas de esa fila, para poder auditar el `days`.
  refs TEXT[] NOT NULL DEFAULT '{}',

  -- El servicio: [{ "point": "Terminal Mldo.", "time": "06:40" }, ...] en el
  -- orden del recorrido. Sólo los puntos por los que pasa (sin nulls).
  timepoints JSONB NOT NULL,

  -- Procedencia: de dónde salió esta fila.
  source_url TEXT,
  document TEXT,
  imported_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_schedules_lookup
  ON line_schedules (operator, line_label, direction, season);

CREATE INDEX IF NOT EXISTS idx_line_schedules_vigencia
  ON line_schedules (season, valid_from, valid_to);

-- Una corrida de importación reemplaza a la anterior de la misma empresa y
-- temporada; esto lo hace el importador borrando antes de insertar. No hay
-- UNIQUE porque dos servicios de la misma línea pueden compartir todo salvo la
-- hora, y la hora está adentro del JSONB.

COMMENT ON TABLE line_schedules IS
  'Horarios publicados por las empresas, por servicio y punto de control. Verano e invierno separados por season + vigencia.';
