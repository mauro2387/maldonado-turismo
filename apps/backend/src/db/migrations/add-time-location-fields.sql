-- Migración: Agregar campos de horarios y ubicación a eventos y noticias
-- Fecha: 2025-11-08

-- Agregar campos de horario a events
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS start_time TIME,
ADD COLUMN IF NOT EXISTS end_time TIME;

-- Agregar campos de ubicación a news
ALTER TABLE news
ADD COLUMN IF NOT EXISTS location VARCHAR(255),
ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS lng DECIMAL(11, 8);

-- Agregar campos de estado para compatibilidad con admin
ALTER TABLE events
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE news
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Migrar datos existentes de image a image_url si es necesario
UPDATE events SET image_url = image WHERE image_url IS NULL AND image IS NOT NULL;
UPDATE news SET image_url = image WHERE image_url IS NULL AND image IS NOT NULL;
UPDATE news SET is_featured = featured WHERE featured IS NOT NULL;

-- Crear índices para los nuevos campos
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_news_location ON news(location);
