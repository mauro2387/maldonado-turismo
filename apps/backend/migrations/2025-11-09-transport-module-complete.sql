-- =====================================================
-- MALDONADO BUS - Sistema de Transporte Inteligente
-- Migración completa GTFS-lite + Extensiones
-- =====================================================

-- Habilitar PostGIS para geometrías
CREATE EXTENSION IF NOT EXISTS postgis;

-- =====================================================
-- 1. RUTAS / LÍNEAS DE BUS
-- =====================================================
CREATE TABLE IF NOT EXISTS bus_routes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE, -- Ej: "L5", "L12"
  name VARCHAR(255) NOT NULL, -- Ej: "Maldonado - Punta del Este"
  description TEXT,
  route_type SMALLINT DEFAULT 3, -- GTFS: 3=bus, 0=tram, 1=metro
  color VARCHAR(6) DEFAULT 'FF5722', -- Color hexadecimal sin #
  text_color VARCHAR(6) DEFAULT 'FFFFFF',
  agency VARCHAR(100) DEFAULT 'Intendencia de Maldonado',
  is_active BOOLEAN DEFAULT true,
  frequency_minutes INTEGER, -- Frecuencia promedio en minutos
  fare_price DECIMAL(10,2), -- Precio del pasaje
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Geometría de la ruta (polilínea completa del recorrido)
CREATE TABLE IF NOT EXISTS route_geometries (
  id SERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES bus_routes(id) ON DELETE CASCADE,
  direction SMALLINT DEFAULT 0, -- 0=ida, 1=vuelta
  geometry GEOGRAPHY(LINESTRING, 4326) NOT NULL, -- PostGIS
  distance_km DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_route_geometries_route ON route_geometries(route_id);
CREATE INDEX idx_route_geometries_geom ON route_geometries USING GIST(geometry);

-- =====================================================
-- 2. PARADAS DE BUS
-- =====================================================
CREATE TABLE IF NOT EXISTS bus_stops (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE, -- Código de parada físico
  name VARCHAR(255) NOT NULL,
  description TEXT,
  lat DECIMAL(10,8) NOT NULL,
  lng DECIMAL(11,8) NOT NULL,
  location GEOGRAPHY(POINT, 4326), -- PostGIS para queries espaciales
  zone VARCHAR(100), -- Zona: "Maldonado Centro", "Punta del Este"
  has_shelter BOOLEAN DEFAULT false, -- Tiene garita/refugio
  has_bench BOOLEAN DEFAULT false,
  has_lighting BOOLEAN DEFAULT false,
  accessibility BOOLEAN DEFAULT false, -- Accesible para sillas de ruedas
  qr_code_id INTEGER, -- Relación con QR (se creará más adelante)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bus_stops_location ON bus_stops USING GIST(location);
CREATE INDEX idx_bus_stops_active ON bus_stops(is_active);

-- Trigger para auto-generar location desde lat/lng
CREATE OR REPLACE FUNCTION update_stop_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stop_location
BEFORE INSERT OR UPDATE ON bus_stops
FOR EACH ROW
EXECUTE FUNCTION update_stop_location();

-- =====================================================
-- 3. RELACIÓN RUTA-PARADAS (secuencia ordenada)
-- =====================================================
CREATE TABLE IF NOT EXISTS route_stops (
  id SERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES bus_routes(id) ON DELETE CASCADE,
  stop_id INTEGER NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,
  direction SMALLINT DEFAULT 0, -- 0=ida, 1=vuelta
  stop_sequence INTEGER NOT NULL, -- Orden de la parada en la ruta
  distance_from_start_km DECIMAL(10,2), -- Distancia acumulada desde origen
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(route_id, direction, stop_sequence)
);

CREATE INDEX idx_route_stops_route ON route_stops(route_id, direction);
CREATE INDEX idx_route_stops_stop ON route_stops(stop_id);

-- =====================================================
-- 4. CALENDARIO DE SERVICIOS (GTFS)
-- =====================================================
CREATE TABLE IF NOT EXISTS service_calendars (
  id SERIAL PRIMARY KEY,
  service_id VARCHAR(50) NOT NULL UNIQUE, -- Ej: "weekday", "weekend", "holiday"
  monday BOOLEAN DEFAULT false,
  tuesday BOOLEAN DEFAULT false,
  wednesday BOOLEAN DEFAULT false,
  thursday BOOLEAN DEFAULT false,
  friday BOOLEAN DEFAULT false,
  saturday BOOLEAN DEFAULT false,
  sunday BOOLEAN DEFAULT false,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_service_calendars_dates ON service_calendars(start_date, end_date);

-- Excepciones de calendario (días feriados, eventos especiales)
CREATE TABLE IF NOT EXISTS service_calendar_dates (
  id SERIAL PRIMARY KEY,
  service_id VARCHAR(50) NOT NULL REFERENCES service_calendars(service_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  exception_type SMALLINT NOT NULL, -- 1=servicio agregado, 2=servicio removido
  description TEXT,
  UNIQUE(service_id, date)
);

-- =====================================================
-- 5. VIAJES (TRIPS) - Horarios específicos
-- =====================================================
CREATE TABLE IF NOT EXISTS bus_trips (
  id SERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES bus_routes(id) ON DELETE CASCADE,
  service_id VARCHAR(50) NOT NULL REFERENCES service_calendars(service_id),
  trip_headsign VARCHAR(255), -- Ej: "Dirección Maldonado"
  direction SMALLINT DEFAULT 0, -- 0=ida, 1=vuelta
  block_id VARCHAR(50), -- Identificador de bloque para transferencias
  vehicle_id VARCHAR(50), -- ID del vehículo (si se trackea GPS)
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bus_trips_route ON bus_trips(route_id);
CREATE INDEX idx_bus_trips_service ON bus_trips(service_id);

-- =====================================================
-- 6. HORARIOS DE PARADAS (STOP_TIMES)
-- =====================================================
CREATE TABLE IF NOT EXISTS stop_times (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES bus_trips(id) ON DELETE CASCADE,
  stop_id INTEGER NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,
  stop_sequence INTEGER NOT NULL, -- Orden de parada en este viaje
  arrival_time TIME NOT NULL, -- Hora de llegada
  departure_time TIME NOT NULL, -- Hora de salida
  stop_headsign VARCHAR(255), -- Letrero en esta parada
  pickup_type SMALLINT DEFAULT 0, -- 0=regular, 1=no hay subida
  drop_off_type SMALLINT DEFAULT 0, -- 0=regular, 1=no hay bajada
  timepoint SMALLINT DEFAULT 1, -- 1=horario exacto, 0=aproximado
  UNIQUE(trip_id, stop_sequence)
);

CREATE INDEX idx_stop_times_trip ON stop_times(trip_id);
CREATE INDEX idx_stop_times_stop ON stop_times(stop_id);
CREATE INDEX idx_stop_times_arrival ON stop_times(arrival_time);

-- =====================================================
-- 7. ALERTAS DE TRANSPORTE
-- =====================================================
CREATE TABLE IF NOT EXISTS transport_alerts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'info', -- info, warning, danger
  alert_type VARCHAR(50), -- "detour", "delay", "construction", "accident"
  route_id INTEGER REFERENCES bus_routes(id) ON DELETE SET NULL,
  stop_id INTEGER REFERENCES bus_stops(id) ON DELETE SET NULL,
  affected_zone VARCHAR(100), -- Zona geográfica afectada
  effective_from TIMESTAMP NOT NULL,
  effective_to TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transport_alerts_active ON transport_alerts(is_active, effective_from, effective_to);
CREATE INDEX idx_transport_alerts_route ON transport_alerts(route_id);
CREATE INDEX idx_transport_alerts_stop ON transport_alerts(stop_id);

-- =====================================================
-- 8. CÓDIGOS QR
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_codes (
  id SERIAL PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL, -- "stop", "route", "event", "place"
  target_id INTEGER NOT NULL, -- ID del recurso
  short_code VARCHAR(20) UNIQUE NOT NULL, -- Código corto: Ej: "MDB-P-3401"
  signed_url TEXT NOT NULL, -- URL firmada digitalmente
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX idx_qr_codes_target ON qr_codes(target_type, target_id);
CREATE INDEX idx_qr_codes_short ON qr_codes(short_code);

-- Escaneos de códigos QR (analítica)
CREATE TABLE IF NOT EXISTS qr_scans (
  id SERIAL PRIMARY KEY,
  qr_code_id INTEGER NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  scanned_at TIMESTAMP DEFAULT NOW(),
  user_agent TEXT,
  ip_address INET,
  geoip_city VARCHAR(100),
  geoip_country VARCHAR(2),
  device_type VARCHAR(20), -- "mobile", "tablet", "desktop"
  language VARCHAR(5) DEFAULT 'es',
  referer TEXT
);

CREATE INDEX idx_qr_scans_qr ON qr_scans(qr_code_id);
CREATE INDEX idx_qr_scans_time ON qr_scans(scanned_at);

-- =====================================================
-- 9. TRACKING GPS EN TIEMPO REAL (futuro)
-- =====================================================
CREATE TABLE IF NOT EXISTS vehicle_positions (
  id SERIAL PRIMARY KEY,
  vehicle_id VARCHAR(50) NOT NULL,
  trip_id INTEGER REFERENCES bus_trips(id) ON DELETE SET NULL,
  route_id INTEGER REFERENCES bus_routes(id) ON DELETE SET NULL,
  lat DECIMAL(10,8) NOT NULL,
  lng DECIMAL(11,8) NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  speed_kmh DECIMAL(5,2),
  heading INTEGER, -- Dirección en grados (0-360)
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vehicle_positions_vehicle ON vehicle_positions(vehicle_id);
CREATE INDEX idx_vehicle_positions_time ON vehicle_positions(timestamp);
CREATE INDEX idx_vehicle_positions_location ON vehicle_positions USING GIST(location);

-- Trigger para location
CREATE OR REPLACE FUNCTION update_vehicle_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_vehicle_location
BEFORE INSERT OR UPDATE ON vehicle_positions
FOR EACH ROW
EXECUTE FUNCTION update_vehicle_location();

-- =====================================================
-- 10. ESTADÍSTICAS DE USO
-- =====================================================
CREATE TABLE IF NOT EXISTS transport_analytics (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL, -- "stop_view", "route_view", "directions_query", "eta_request"
  resource_type VARCHAR(20), -- "stop", "route", "trip"
  resource_id INTEGER,
  user_session_id VARCHAR(100),
  user_agent TEXT,
  ip_address INET,
  geoip_city VARCHAR(100),
  device_type VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transport_analytics_type ON transport_analytics(event_type, created_at);
CREATE INDEX idx_transport_analytics_resource ON transport_analytics(resource_type, resource_id);

-- =====================================================
-- 11. VISTAS MATERIALIZADAS PARA PERFORMANCE
-- =====================================================

-- Vista: Próximos arribos por parada (pre-calculado)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_next_arrivals AS
SELECT 
  st.stop_id,
  bt.route_id,
  br.code as route_code,
  br.name as route_name,
  br.color,
  bt.trip_headsign,
  st.arrival_time,
  st.departure_time,
  sc.monday, sc.tuesday, sc.wednesday, sc.thursday, sc.friday, sc.saturday, sc.sunday,
  bt.direction
FROM stop_times st
JOIN bus_trips bt ON st.trip_id = bt.id
JOIN bus_routes br ON bt.route_id = br.id
JOIN service_calendars sc ON bt.service_id = sc.service_id
WHERE br.is_active = true
  AND sc.end_date >= CURRENT_DATE
ORDER BY st.stop_id, st.arrival_time;

CREATE INDEX idx_mv_next_arrivals_stop ON mv_next_arrivals(stop_id);
CREATE INDEX idx_mv_next_arrivals_time ON mv_next_arrivals(arrival_time);

-- Vista: Resumen de rutas
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_route_summary AS
SELECT 
  br.id as route_id,
  br.code,
  br.name,
  br.color,
  COUNT(DISTINCT rs.stop_id) as total_stops,
  MIN(rg.distance_km) as route_length_km,
  COUNT(DISTINCT bt.id) as total_trips_per_day,
  br.frequency_minutes
FROM bus_routes br
LEFT JOIN route_stops rs ON br.id = rs.route_id
LEFT JOIN route_geometries rg ON br.id = rg.route_id
LEFT JOIN bus_trips bt ON br.id = bt.route_id
WHERE br.is_active = true
GROUP BY br.id, br.code, br.name, br.color, br.frequency_minutes;

-- Vista: Paradas más consultadas
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_popular_stops AS
SELECT 
  bs.id,
  bs.code,
  bs.name,
  bs.zone,
  COUNT(ta.id) as view_count,
  COUNT(DISTINCT ta.user_session_id) as unique_users,
  COUNT(qs.id) as qr_scans
FROM bus_stops bs
LEFT JOIN transport_analytics ta ON ta.resource_type = 'stop' AND ta.resource_id = bs.id
LEFT JOIN qr_codes qc ON qc.target_type = 'stop' AND qc.target_id = bs.id
LEFT JOIN qr_scans qs ON qs.qr_code_id = qc.id
WHERE bs.is_active = true
GROUP BY bs.id, bs.code, bs.name, bs.zone
ORDER BY view_count DESC;

-- =====================================================
-- 12. FUNCIONES AUXILIARES
-- =====================================================

-- Función: Buscar paradas cercanas
CREATE OR REPLACE FUNCTION find_nearby_stops(
  p_lat DECIMAL,
  p_lng DECIMAL,
  p_radius_meters INTEGER DEFAULT 500
)
RETURNS TABLE (
  id INTEGER,
  code VARCHAR,
  name VARCHAR,
  lat DECIMAL,
  lng DECIMAL,
  distance_meters DOUBLE PRECISION,
  zone VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bs.id,
    bs.code,
    bs.name,
    bs.lat,
    bs.lng,
    ST_Distance(
      bs.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) as distance_meters,
    bs.zone
  FROM bus_stops bs
  WHERE bs.is_active = true
    AND ST_DWithin(
      bs.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_meters
    )
  ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql;

-- Función: Calcular ETA para una parada
CREATE OR REPLACE FUNCTION calculate_stop_eta(
  p_stop_id INTEGER,
  p_current_time TIME DEFAULT CURRENT_TIME
)
RETURNS TABLE (
  route_code VARCHAR,
  route_name VARCHAR,
  headsign VARCHAR,
  eta_minutes INTEGER,
  arrival_time TIME,
  color VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    br.code,
    br.name,
    bt.trip_headsign,
    EXTRACT(EPOCH FROM (st.arrival_time - p_current_time)) / 60 AS eta_minutes,
    st.arrival_time,
    br.color
  FROM stop_times st
  JOIN bus_trips bt ON st.trip_id = bt.id
  JOIN bus_routes br ON bt.route_id = br.id
  JOIN service_calendars sc ON bt.service_id = sc.service_id
  WHERE st.stop_id = p_stop_id
    AND br.is_active = true
    AND st.arrival_time > p_current_time
    AND (
      CASE EXTRACT(DOW FROM CURRENT_DATE)
        WHEN 0 THEN sc.sunday
        WHEN 1 THEN sc.monday
        WHEN 2 THEN sc.tuesday
        WHEN 3 THEN sc.wednesday
        WHEN 4 THEN sc.thursday
        WHEN 5 THEN sc.friday
        WHEN 6 THEN sc.saturday
      END = true
    )
    AND CURRENT_DATE BETWEEN sc.start_date AND sc.end_date
  ORDER BY st.arrival_time
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 13. DATOS DE EJEMPLO (SEED)
-- =====================================================

-- Calendario de servicios básico
INSERT INTO service_calendars (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date, description)
VALUES 
  ('weekday', true, true, true, true, true, false, false, '2025-01-01', '2025-12-31', 'Lunes a Viernes'),
  ('weekend', false, false, false, false, false, true, true, '2025-01-01', '2025-12-31', 'Fines de semana'),
  ('daily', true, true, true, true, true, true, true, '2025-01-01', '2025-12-31', 'Todos los días')
ON CONFLICT (service_id) DO NOTHING;

-- Ruta ejemplo: Línea 5
INSERT INTO bus_routes (code, name, description, color, text_color, frequency_minutes, fare_price)
VALUES 
  ('L5', 'Maldonado - Punta del Este', 'Línea directa entre Maldonado centro y Punta del Este', 'FF5722', 'FFFFFF', 15, 45.00),
  ('L12', 'Maldonado - Punta Ballena', 'Recorrido costero hacia Punta Ballena', '2196F3', 'FFFFFF', 30, 50.00)
ON CONFLICT (code) DO NOTHING;

-- Paradas ejemplo
INSERT INTO bus_stops (code, name, lat, lng, zone, has_shelter, accessibility)
VALUES 
  ('MDB-001', 'Terminal Maldonado', -34.9087, -54.9581, 'Maldonado Centro', true, true),
  ('MDB-002', 'Plaza San Fernando', -34.9100, -54.9560, 'Maldonado Centro', true, true),
  ('PDE-001', 'Gorlero y Calle 20', -34.9502, -54.9454, 'Punta del Este', true, true),
  ('PDE-002', 'Puerto de Punta del Este', -34.9625, -54.9503, 'Punta del Este', true, true)
ON CONFLICT (code) DO NOTHING;

-- Comentarios
COMMENT ON TABLE bus_routes IS 'Líneas de bus del sistema de transporte público';
COMMENT ON TABLE bus_stops IS 'Paradas de bus con información geoespacial y amenidades';
COMMENT ON TABLE stop_times IS 'Horarios GTFS: qué bus llega a qué parada a qué hora';
COMMENT ON TABLE qr_codes IS 'Códigos QR generados para paradas y otros recursos';
COMMENT ON TABLE transport_analytics IS 'Analítica de uso del sistema de transporte';

-- =====================================================
-- FINALIZADO
-- =====================================================
-- Este schema soporta:
-- ✅ GTFS completo (rutas, paradas, horarios, calendarios)
-- ✅ Geometrías PostGIS para mapas
-- ✅ Sistema de QR con tracking
-- ✅ Alertas de transporte
-- ✅ Analítica y estadísticas
-- ✅ GPS en tiempo real (preparado para futuro)
-- ✅ Vistas materializadas para performance
-- ✅ Funciones auxiliares para queries complejas
