# Migración de Base de Datos - Horarios y Ubicación

## Instrucciones para ejecutar en Supabase Dashboard

1. Ve a tu proyecto en Supabase: https://supabase.com/dashboard
2. Ve a la sección **SQL Editor** en el menú lateral
3. Crea una nueva query y copia el siguiente SQL:

```sql
-- Migración: Agregar campos de horarios y ubicación a eventos y noticias
-- Fecha: 2025-11-08

-- Agregar campos de horario a events
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS start_time TIME,
ADD COLUMN IF NOT EXISTS end_time TIME,
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Agregar campos de ubicación a news
ALTER TABLE news
ADD COLUMN IF NOT EXISTS location VARCHAR(255),
ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS lng DECIMAL(11, 8),
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
```

4. Haz clic en **Run** para ejecutar la migración
5. Verifica que se hayan creado las columnas correctamente

## Verificación

Después de ejecutar la migración, puedes verificar con:

```sql
-- Verificar columnas de events
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'events';

-- Verificar columnas de news
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'news';
```

## Campos agregados

### Events
- `start_time` (TIME): Hora de inicio del evento
- `end_time` (TIME): Hora de finalización del evento
- `image_url` (VARCHAR): URL de la imagen (compatible con admin)
- `is_featured` (BOOLEAN): Si el evento es destacado
- `is_active` (BOOLEAN): Si el evento está activo

### News
- `location` (VARCHAR): Ubicación de la noticia
- `lat` (DECIMAL): Latitud de la ubicación
- `lng` (DECIMAL): Longitud de la ubicación
- `image_url` (VARCHAR): URL de la imagen (compatible con admin)
- `is_featured` (BOOLEAN): Si la noticia es destacada
- `is_active` (BOOLEAN): Si la noticia está activa
