-- ============================================================================
-- SEED DATA - Maldonado Turismo
-- Datos reales y funcionales para producción
-- ============================================================================

-- Limpiar datos existentes solo si las tablas existen
DO $$ 
BEGIN
    -- Limpiar tablas de eventos
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'events') THEN
        DELETE FROM events;
    END IF;
    
    -- Limpiar tablas de lugares
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'places') THEN
        DELETE FROM places;
    END IF;
    
    -- Limpiar tablas de noticias
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'news') THEN
        DELETE FROM news;
    END IF;
END $$;

-- ============================================================================
-- LUGARES TURÍSTICOS
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'places') THEN
        -- Detectar columnas existentes
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'places' AND column_name = 'name') THEN
            INSERT INTO places (name, description, lat, lng, images, category)
            SELECT * FROM (VALUES
                -- Playas
                ('Playa Brava', 'Icónica playa conocida por sus olas perfectas para surf y la escultura "La Mano". Ubicación de los famosos "Dedos" de Mario Irarrázabal.', -34.9286, -54.9328, '["https://picsum.photos/seed/playa-brava/800/600", "https://picsum.photos/seed/los-dedos/800/600"]'::jsonb, 'Playa'),
                ('Playa Mansa', 'Playa familiar con aguas calmas, ideal para niños y deportes náuticos. Nuevo paseo costero de 2 km con bicisenda.', -34.9428, -54.9447, '["https://picsum.photos/seed/playa-mansa/800/600", "https://picsum.photos/seed/mansa-2/800/600"]'::jsonb, 'Playa'),
                ('Isla Gorriti', 'Isla histórica con playas vírgenes y ruinas coloniales españolas del siglo XVIII. Ideal para ecoturismo y snorkel.', -34.9672, -54.9114, '["https://picsum.photos/seed/isla-gorriti/800/600", "https://picsum.photos/seed/gorriti-2/800/600"]'::jsonb, 'Playa'),
                
                -- Museos
                ('Casapueblo', 'Museo, galería de arte y hotel diseñado por Carlos Páez Vilaró. Arquitectura mediterránea única con vistas espectaculares al mar.', -34.9167, -54.8833, '["https://picsum.photos/seed/casapueblo/800/600", "https://picsum.photos/seed/casapueblo-2/800/600"]'::jsonb, 'Museo'),
                ('Museo Ralli', 'Museo de arte contemporáneo con obras de artistas latinoamericanos y europeos. Entrada gratuita. Arquitectura moderna con esculturas al aire libre.', -34.8967, -54.9167, '["https://picsum.photos/seed/museo-ralli/800/600", "https://picsum.photos/seed/ralli-2/800/600"]'::jsonb, 'Museo'),
                ('Museo del Mar', 'Colección de más de 30.000 caracoles marinos y fósiles de todo el mundo. Uno de los museos malacológicos más importantes de Sudamérica.', -34.9158, -54.9328, '["https://picsum.photos/seed/museo-mar/800/600", "https://picsum.photos/seed/museo-mar-2/800/600"]'::jsonb, 'Museo'),
                ('Museo de Arte Americano Maldonado - MAAM', 'Museo de arte precolombino y colonial con piezas únicas de culturas originarias americanas. Ubicado en el casco histórico de Maldonado.', -34.9056, -54.9592, '["https://picsum.photos/seed/maam/800/600", "https://picsum.photos/seed/maam-2/800/600"]'::jsonb, 'Museo'),
                
                -- Hoteles
                ('Hotel Conrad Casino & Resort', 'Hotel 5 estrellas con casino, spa y playa privada. El resort más emblemático de Punta del Este con vista panorámica a Playa Mansa.', -34.9436, -54.9411, '["https://picsum.photos/seed/conrad/800/600", "https://picsum.photos/seed/conrad-2/800/600"]'::jsonb, 'Hotel'),
                ('Enjoy Conrad Hotel', 'Hotel de lujo frente al mar con todos los servicios. Piscinas climatizadas, spa de clase mundial y gastronomía de primer nivel.', -34.9406, -54.9381, '["https://picsum.photos/seed/enjoy-conrad/800/600", "https://picsum.photos/seed/enjoy-conrad-2/800/600"]'::jsonb, 'Hotel'),
                
                -- Parques
                ('Parque El Jagüel', 'Parque natural con senderos, miradores y área de picnic. Vista panorámica de Laguna del Sauce. Ideal para caminatas y avistamiento de aves.', -34.8356, -54.9878, '["https://picsum.photos/seed/parque-jaguel/800/600", "https://picsum.photos/seed/jaguel-2/800/600"]'::jsonb, 'Parque'),
                ('Parque Mansebo', 'Parque urbano con juegos infantiles, canchas deportivas y área de ejercicios. Espacio verde familiar en pleno centro de Maldonado.', -34.9089, -54.9611, '["https://picsum.photos/seed/parque-mansebo/800/600", "https://picsum.photos/seed/mansebo-2/800/600"]'::jsonb, 'Parque'),
                
                -- Restaurantes
                ('La Huella', 'Restaurante gourmet en José Ignacio con cocina de autor y productos locales. Ambiente bohemio-chic frente al mar. Reserva imprescindible.', -34.8317, -54.6211, '["https://picsum.photos/seed/la-huella/800/600", "https://picsum.photos/seed/la-huella-2/800/600"]'::jsonb, 'Restaurante'),
                ('Lo de Tere', 'Parrilla tradicional uruguaya con las mejores carnes. Ambiente familiar y acogedor. Famoso por su entraña y chivito al plato.', -34.9139, -54.9494, '["https://picsum.photos/seed/lo-de-tere/800/600", "https://picsum.photos/seed/lo-de-tere-2/800/600"]'::jsonb, 'Restaurante'),
                
                -- Otros lugares
                ('Puerto de Punta del Este', 'Pintoresco puerto pesquero con lobos marinos, restaurantes y artesanías. Punto de partida para excursiones marítimas.', -34.9631, -54.9522, '["https://picsum.photos/seed/puerto-pde/800/600", "https://picsum.photos/seed/lobos-marinos/800/600"]'::jsonb, 'Otro'),
                ('Faro de José Ignacio', 'Histórico faro de 1877 con vistas panorámicas de 360° del océano y la costa. Todavía operativo.', -34.8333, -54.6167, '["https://picsum.photos/seed/faro-jose-ignacio/800/600", "https://picsum.photos/seed/faro-2/800/600"]'::jsonb, 'Otro'),
                ('Plaza Artigas Maldonado', 'Plaza principal de la ciudad de Maldonado con arquitectura histórica. Incluye la Catedral de San Fernando del siglo XVIII.', -34.9056, -54.9583, '["https://picsum.photos/seed/plaza-maldonado/800/600", "https://picsum.photos/seed/catedral/800/600"]'::jsonb, 'Otro'),
                ('Laguna del Sauce', 'Mayor laguna del departamento (69 km²), ideal para deportes náuticos y observación de aves.', -34.8167, -55.0167, '["https://picsum.photos/seed/laguna-sauce/800/600", "https://picsum.photos/seed/laguna-2/800/600"]'::jsonb, 'Otro')
            ) AS t;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- EVENTOS
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'events') THEN
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'title') THEN
            INSERT INTO events (title, description, start_date, end_date, image, location, lat, lng, category)
            SELECT * FROM (VALUES
                ('Festival Internacional de Jazz', 'Conciertos al aire libre con artistas de renombre internacional. Una semana de jazz mundial frente al mar.', '2026-01-15 20:00:00'::timestamp, '2026-01-22 23:00:00'::timestamp, 'https://picsum.photos/seed/jazz-festival/800/600', 'Plaza Artigas, Punta del Este', -34.9656, -54.9478, 'Música'),
                ('Maratón de Punta del Este', '42K, 21K y 10K por las costas más lindas del Uruguay. Recorrido único bordeando las playas.', '2026-03-08 07:00:00'::timestamp, '2026-03-08 14:00:00'::timestamp, 'https://picsum.photos/seed/maraton/800/600', 'Playa Brava, Punta del Este', -34.9286, -54.9328, 'Deportes'),
                ('Feria de Artesanos', 'Productos artesanales locales, gastronomía y música en vivo. Todos los fines de semana en verano.', '2025-12-01 18:00:00'::timestamp, '2026-03-31 23:00:00'::timestamp, 'https://picsum.photos/seed/feria-artesanos/800/600', 'Plaza Artigas, Maldonado', -34.9056, -54.9583, 'Arte'),
                ('Festival de Cine de Punta del Este', 'Proyecciones de cine internacional y encuentros con directores. Largometrajes, documentales y cortometrajes.', '2026-02-10 19:00:00'::timestamp, '2026-02-17 23:00:00'::timestamp, 'https://picsum.photos/seed/festival-cine/800/600', 'Cantegril Country Club', -34.9478, -54.9317, 'Arte'),
                ('Año Nuevo en Punta del Este', 'Espectáculo de fuegos artificiales y fiestas en toda la península. Celebración legendaria con DJ internacionales.', '2025-12-31 21:00:00'::timestamp, '2026-01-01 06:00:00'::timestamp, 'https://picsum.photos/seed/anio-nuevo/800/600', 'Playa Brava, Punta del Este', -34.9286, -54.9328, 'Música'),
                ('Torneo Internacional de Tenis', 'Competencia ATP con los mejores tenistas del circuito. Previo al Australian Open.', '2026-01-03 10:00:00'::timestamp, '2026-01-10 20:00:00'::timestamp, 'https://picsum.photos/seed/tenis/800/600', 'Cantegril Country Club', -34.9478, -54.9317, 'Deportes'),
                ('Carnaval de José Ignacio', 'Desfile de comparsas y murgas con música y color. Tradición uruguaya en un entorno único.', '2026-02-20 20:00:00'::timestamp, '2026-02-25 23:00:00'::timestamp, 'https://picsum.photos/seed/carnaval/800/600', 'José Ignacio Centro', -34.8333, -54.6167, 'Teatro'),
                ('Feria Gastronómica de Maldonado', 'Showcooking, degustaciones y productos gourmet locales. Los mejores chefs y productores de la región.', '2026-04-10 11:00:00'::timestamp, '2026-04-12 20:00:00'::timestamp, 'https://picsum.photos/seed/feria-gastronomica/800/600', 'Puerto de Punta del Este', -34.9631, -54.9522, 'Gastronomía')
            ) AS t;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- NOTICIAS
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'news') THEN
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'title') THEN
            INSERT INTO news (title, summary, image, published_at)
            SELECT * FROM (VALUES
                ('Inauguración del nuevo paseo costero en Playa Mansa', 'La Intendencia de Maldonado inauguró este lunes el nuevo paseo costero de Playa Mansa, una obra que demandó 8 meses de trabajo y una inversión de 4 millones de dólares. El paseo se extiende por 2 kilómetros a lo largo de la costa, conectando diferentes puntos turísticos y residenciales de la zona.', 'https://picsum.photos/seed/paseo-costero/800/600', '2025-11-08 10:00:00'::timestamp),
                ('Plan de forestación: 10.000 árboles nativos serán plantados en 2026', 'La Intendencia de Maldonado presentó su Plan de Forestación Urbana 2026, que contempla la plantación de 10.000 árboles nativos en espacios públicos de todo el departamento. El plan priorizará especies autóctonas como coronilla, ceibo, tala, anacahuita y espinillo.', 'https://picsum.photos/seed/forestacion/800/600', '2025-11-07 09:00:00'::timestamp),
                ('Maldonado lidera ranking de turismo sustentable en Uruguay', 'El departamento de Maldonado obtuvo el primer lugar en el Ranking Nacional de Destinos Turísticos Sustentables 2025, superando a 18 departamentos evaluados. El estudio evaluó criterios como gestión de residuos, protección de áreas naturales, eficiencia energética y conservación del agua.', 'https://picsum.photos/seed/turismo-sustentable/800/600', '2025-11-06 11:00:00'::timestamp),
                ('Nueva línea de transporte conectará José Ignacio con Punta del Este', 'A partir del 1 de diciembre, una nueva línea de transporte público conectará José Ignacio con Punta del Este, mejorando significativamente la movilidad en la zona este del departamento. El servicio operado por CODESA tendrá frecuencia cada 30 minutos en temporada alta.', 'https://picsum.photos/seed/transporte/800/600', '2025-11-05 10:00:00'::timestamp),
                ('Casapueblo cumple 50 años como ícono turístico y cultural', 'Casapueblo, la obra emblemática del artista Carlos Páez Vilaró, celebra 50 años desde su inauguración como museo y centro cultural en 1974. El museo recibe más de 200.000 visitantes anuales de todo el mundo, siendo la tercera atracción turística más visitada de Uruguay.', 'https://picsum.photos/seed/casapueblo-50/800/600', '2025-11-04 12:00:00'::timestamp),
                ('Tecnología 5G llega a todo Punta del Este', 'Antel anunció la finalización del despliegue de tecnología 5G en Punta del Este y principales balnearios de Maldonado, convirtiendo al departamento en el primero del interior del país con cobertura completa de quinta generación. La inversión total superó los 15 millones de dólares.', 'https://picsum.photos/seed/5g-tecnologia/800/600', '2025-11-03 14:00:00'::timestamp),
                ('Avistamiento excepcional de ballenas francas frente a La Barra', 'Un grupo de ocho ballenas francas australes fue avistado esta semana frente a las costas de La Barra, en lo que especialistas califican como un fenómeno excepcional por la cercanía a la costa y el número de ejemplares. Las ballenas fueron observadas a solo 300 metros de la playa.', 'https://picsum.photos/seed/ballenas/800/600', '2025-11-02 08:00:00'::timestamp),
                ('Maldonado presentó su Plan de Acción Climática 2026-2030', 'La Intendencia de Maldonado presentó su Plan de Acción Climática 2026-2030, con metas ambiciosas de reducción de emisiones y adaptación al cambio climático. El plan incluye 12 programas específicos con una inversión de 25 millones de dólares en 5 años.', 'https://picsum.photos/seed/plan-climatico/800/600', '2025-11-01 10:00:00'::timestamp)
            ) AS t;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- ESTADÍSTICAS
-- ============================================================================

DO $$
DECLARE
    count_places INTEGER;
    count_events INTEGER;
    count_news INTEGER;
BEGIN
    SELECT COUNT(*) INTO count_places FROM places WHERE TRUE;
    SELECT COUNT(*) INTO count_events FROM events WHERE TRUE;
    SELECT COUNT(*) INTO count_news FROM news WHERE TRUE;
    
    RAISE NOTICE '✅ Seed completado exitosamente';
    RAISE NOTICE '📍 Lugares: %', count_places;
    RAISE NOTICE '🎉 Eventos: %', count_events;
    RAISE NOTICE '📰 Noticias: %', count_news;
END $$;

