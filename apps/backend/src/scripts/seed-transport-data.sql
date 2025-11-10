-- Seed data para transporte público de Maldonado

-- IMPORTANTE: Eliminar tablas existentes si tienen estructura incorrecta
DROP TABLE IF EXISTS transport_alerts CASCADE;
DROP TABLE IF EXISTS bus_stops CASCADE;
DROP TABLE IF EXISTS bus_routes CASCADE;

-- Crear tabla bus_routes
CREATE TABLE bus_routes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  route_type SMALLINT DEFAULT 3,
  color VARCHAR(6) DEFAULT 'FF5722',
  text_color VARCHAR(6) DEFAULT 'FFFFFF',
  agency VARCHAR(100) DEFAULT 'Intendencia de Maldonado',
  is_active BOOLEAN DEFAULT true,
  frequency_minutes INTEGER,
  fare_price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla bus_stops
CREATE TABLE bus_stops (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  lat DECIMAL(10,8) NOT NULL,
  lng DECIMAL(11,8) NOT NULL,
  zone VARCHAR(100),
  has_shelter BOOLEAN DEFAULT false,
  has_bench BOOLEAN DEFAULT false,
  has_lighting BOOLEAN DEFAULT false,
  accessibility BOOLEAN DEFAULT false,
  qr_code_id INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla transport_alerts
CREATE TABLE transport_alerts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'info',
  alert_type VARCHAR(50),
  route_id INTEGER REFERENCES bus_routes(id),
  stop_id INTEGER REFERENCES bus_stops(id),
  effective_from TIMESTAMP,
  effective_to TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insertar rutas de buses
INSERT INTO bus_routes (code, name, description, route_type, color, text_color, frequency_minutes, fare_price, is_active, created_at, updated_at)
VALUES
  ('L5', 'Línea 5 - Terminal/Centro', 'Ruta principal que conecta la terminal con el centro de Maldonado', 3, '1976D2', 'FFFFFF', 15, 45.00, true, NOW(), NOW()),
  ('L12', 'Línea 12 - Playa Mansa/San Carlos', 'Conecta Punta del Este con San Carlos', 3, '388E3C', 'FFFFFF', 20, 55.00, true, NOW(), NOW()),
  ('L7', 'Línea 7 - Punta del Este Tour', 'Circuito turístico por principales atractivos', 3, 'F57C00', 'FFFFFF', 30, 80.00, true, NOW(), NOW()),
  ('L3', 'Línea 3 - Zona Este', 'Recorrido por barrios de la zona este', 3, 'E91E63', 'FFFFFF', 12, 45.00, true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Insertar paradas de buses
INSERT INTO bus_stops (code, name, description, lat, lng, zone, has_shelter, has_bench, has_lighting, accessibility, is_active, created_at, updated_at)
VALUES
  ('MDB-P-001', 'Terminal de Ómnibus', 'Parada principal frente a la terminal', -34.9110, -54.9570, 'Centro', true, true, true, true, true, NOW(), NOW()),
  ('MDB-P-002', 'Plaza Independencia', 'Parada céntrica cerca de la plaza principal', -34.9078, -54.9583, 'Centro', true, true, true, true, true, NOW(), NOW()),
  ('MDB-P-003', 'Hospital de Maldonado', 'Parada frente al hospital regional', -34.9054, -54.9548, 'Centro', true, true, true, true, true, NOW(), NOW()),
  ('MDB-P-004', 'Playa Mansa - Parada 1', 'Primera parada de playa mansa', -34.9322, -54.9445, 'Playa Mansa', true, false, true, true, true, NOW(), NOW()),
  ('MDB-P-005', 'Playa Mansa - Parada 5', 'Quinta parada de playa mansa', -34.9418, -54.9398, 'Playa Mansa', false, true, true, false, true, NOW(), NOW()),
  ('MDB-P-006', 'Gorlero y 20', 'Parada en avenida Gorlero esquina 20', -34.9589, -54.9467, 'Península', true, true, true, true, true, NOW(), NOW()),
  ('MDB-P-007', 'Puerto de Punta del Este', 'Parada cerca del puerto', -34.9665, -54.9512, 'Puerto', true, true, true, true, true, NOW(), NOW()),
  ('MDB-P-008', 'San Carlos Centro', 'Plaza central de San Carlos', -34.7956, -54.9089, 'San Carlos', true, true, true, true, true, NOW(), NOW()),
  ('MDB-P-009', 'La Barra - Puente', 'Parada en La Barra junto al puente', -34.8678, -54.8356, 'La Barra', false, true, true, false, true, NOW(), NOW()),
  ('MDB-P-010', 'Canteras Las Piedras', 'Parada en zona residencial', -34.9156, -54.9423, 'Las Piedras', true, false, false, false, true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Insertar alertas de transporte
INSERT INTO transport_alerts (title, message, severity, alert_type, route_id, effective_from, effective_to, is_active, created_at, updated_at)
VALUES
  (
    'Desvío en Rambla',
    'La Línea 5 circula con desvío por obras en Rambla Williman entre calles 10 y 15. El recorrido normal se restablecerá el 15 de noviembre.',
    'warning',
    'detour',
    (SELECT id FROM bus_routes WHERE code = 'L5' LIMIT 1),
    '2025-11-01 00:00:00',
    '2025-11-15 23:59:59',
    true,
    NOW(),
    NOW()
  ),
  (
    'Horario especial fin de semana largo',
    'Durante el fin de semana largo del 18-19 de noviembre, todas las líneas circularán con frecuencia reducida. Consulte horarios en nuestra web.',
    'info',
    'other',
    NULL,
    '2025-11-18 00:00:00',
    '2025-11-19 23:59:59',
    true,
    NOW(),
    NOW()
  ),
  (
    'Parada fuera de servicio',
    'La parada MDB-P-009 (La Barra - Puente) está temporalmente fuera de servicio por tareas de mantenimiento. Utilice la parada siguiente.',
    'danger',
    'construction',
    NULL,
    '2025-11-09 06:00:00',
    '2025-11-12 18:00:00',
    true,
    NOW(),
    NOW()
  )
ON CONFLICT DO NOTHING;

-- Mostrar resumen de datos insertados
SELECT 'Rutas insertadas:' as tipo, COUNT(*) as cantidad FROM bus_routes WHERE is_active = true
UNION ALL
SELECT 'Paradas insertadas:' as tipo, COUNT(*) as cantidad FROM bus_stops WHERE is_active = true
UNION ALL
SELECT 'Alertas activas:' as tipo, COUNT(*) as cantidad FROM transport_alerts WHERE is_active = true;
