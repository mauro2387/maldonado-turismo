-- Migración: contenido turístico verificado en places
-- Fecha: 2026-09-01
--
-- La tabla venía con ocho filas de relleno: fotos genéricas de banco de
-- imágenes y textos inventados. Para poder cargar contenido real hacen falta
-- dos campos más.

ALTER TABLE places
  -- Balneario o ciudad, normalizado igual que en events.locality. Es lo que
  -- usa el filtro por zona.
  ADD COLUMN IF NOT EXISTS locality varchar(80),
  -- Crédito de cada foto: [{ url, author, license, license_url, source }].
  --
  -- No es opcional. Las fotos vienen de Wikimedia Commons y casi todas son
  -- CC BY o CC BY-SA, licencias que exigen atribuir al autor y enlazar la
  -- licencia. Sin este campo la app estaría incumpliendo, así que la ficha del
  -- lugar tiene que poder mostrar el crédito.
  ADD COLUMN IF NOT EXISTS image_credits jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Los imperdibles del lugar, para la ficha.
  ADD COLUMN IF NOT EXISTS highlights text[],
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- El nombre identifica al atractivo y es lo que usa el upsert del seed.
CREATE UNIQUE INDEX IF NOT EXISTS places_name_unique ON places (name);
CREATE INDEX IF NOT EXISTS places_locality_idx ON places (locality);
CREATE INDEX IF NOT EXISTS places_category_idx ON places (category);

-- price_range entraba en 50 caracteres cuando decía sólo "Gratis" o "$$". Los
-- precios reales vienen escalonados ("$U 600 general · $U 500 residentes
-- mayores de 65 · menores de 12 gratis") y no entran.
ALTER TABLE places ALTER COLUMN price_range TYPE varchar(160);
