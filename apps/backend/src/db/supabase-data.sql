-- ============================================================================
-- SEED DATA PARA SUPABASE - Maldonado Turismo
-- Datos reales y funcionales
-- ============================================================================

-- Limpiar datos existentes
TRUNCATE TABLE transport_alerts, bus_routes, bus_stops, news, events, places RESTART IDENTITY CASCADE;

-- ============================================================================
-- LUGARES TURÍSTICOS (8 lugares icónicos)
-- ============================================================================

INSERT INTO places (name, description, lat, lng, address, phone, email, website, category, images, schedule, price_range, facilities, activities, tips, contact) VALUES
(
    'Playa Brava',
    'Icónica playa conocida por sus olas perfectas para surf y la escultura "La Mano"',
    -34.9286, -54.9328,
    'Playa Brava, Punta del Este',
    '+598 42 440 512',
    'info@puntadeleste.gub.uy',
    NULL,
    'Playas',
    '["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200"]'::jsonb,
    '{"monday": "00:00-23:59", "tuesday": "00:00-23:59", "wednesday": "00:00-23:59", "thursday": "00:00-23:59", "friday": "00:00-23:59", "saturday": "00:00-23:59", "sunday": "00:00-23:59"}'::jsonb,
    'Gratis',
    ARRAY['Estacionamiento', 'Baños públicos', 'Salvavidas', 'Duchas'],
    ARRAY['Surf', 'Fotografía', 'Caminatas'],
    ARRAY['Ideal para surf', 'Mejor hora para fotos: atardecer', 'Llegar temprano en verano'],
    '{"phone": "+598 42 440 512", "email": "info@puntadeleste.gub.uy"}'::jsonb
),
(
    'Casapueblo',
    'Museo, galería de arte y hotel diseñado por Carlos Páez Vilaró',
    -34.9167, -54.8833,
    'Punta Ballena, Maldonado',
    '+598 4257 8041',
    'info@casapueblo.com.uy',
    'https://www.casapueblo.com.uy',
    'Museos',
    '["https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=1200"]'::jsonb,
    '{"monday": "10:00-17:00", "tuesday": "10:00-17:00", "wednesday": "10:00-17:00", "thursday": "10:00-17:00", "friday": "10:00-17:00", "saturday": "10:00-18:00", "sunday": "10:00-18:00"}'::jsonb,
    '$$$',
    ARRAY['Museo', 'Galería', 'Hotel', 'Restaurante', 'Estacionamiento'],
    ARRAY['Tour guiado', 'Ceremonia del atardecer', 'Exposiciones'],
    ARRAY['No te pierdas la ceremonia del atardecer', 'Reserva con anticipación en temporada'],
    '{"phone": "+598 4257 8041", "email": "info@casapueblo.com.uy", "website": "https://www.casapueblo.com.uy"}'::jsonb
),
(
    'Puerto de Punta del Este',
    'Pintoresco puerto pesquero con lobos marinos y restaurantes',
    -34.9631, -54.9522,
    'Rambla Artigas, Puerto',
    '+598 42 440 512',
    NULL, NULL,
    'Puertos',
    '["https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200"]'::jsonb,
    '{"monday": "06:00-22:00", "tuesday": "06:00-22:00", "wednesday": "06:00-22:00", "thursday": "06:00-22:00", "friday": "06:00-23:00", "saturday": "06:00-23:00", "sunday": "06:00-22:00"}'::jsonb,
    'Gratis',
    ARRAY['Restaurantes', 'Mercado', 'Estacionamiento'],
    ARRAY['Observación de lobos marinos', 'Paseos en barco', 'Gastronomía'],
    ARRAY['Mejor momento para lobos: mañana temprano', 'Prueba pescados frescos'],
    '{"phone": "+598 42 440 512"}'::jsonb
),
(
    'Playa Mansa',
    'Playa familiar con aguas calmas, ideal para niños',
    -34.9428, -54.9447,
    'Playa Mansa, Punta del Este',
    '+598 42 440 512',
    NULL, NULL,
    'Playas',
    '["https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200"]'::jsonb,
    '{"monday": "00:00-23:59", "tuesday": "00:00-23:59", "wednesday": "00:00-23:59", "thursday": "00:00-23:59", "friday": "00:00-23:59", "saturday": "00:00-23:59", "sunday": "00:00-23:59"}'::jsonb,
    'Gratis',
    ARRAY['Salvavidas', 'Baños', 'Estacionamiento', 'Alquiler de equipos'],
    ARRAY['Natación', 'Paddle', 'Kayak', 'Caminatas'],
    ARRAY['Ideal para familias', 'Paseo costero perfecto para ciclismo', 'Atardeceres espectaculares'],
    '{"phone": "+598 42 440 512"}'::jsonb
),
(
    'Isla Gorriti',
    'Isla histórica con playas vírgenes y ruinas coloniales',
    -34.9672, -54.9114,
    'Bahía de Maldonado',
    '+598 42 440 512',
    NULL, NULL,
    'Islas',
    '["https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200"]'::jsonb,
    '{"monday": "10:00-18:00", "tuesday": "10:00-18:00", "wednesday": "10:00-18:00", "thursday": "10:00-18:00", "friday": "10:00-18:00", "saturday": "10:00-18:00", "sunday": "10:00-18:00"}'::jsonb,
    '$$',
    ARRAY['Playas', 'Senderos', 'Área picnic'],
    ARRAY['Snorkel', 'Kayak', 'Senderismo', 'Observación de aves'],
    ARRAY['Llevar agua y protector', 'Reservar transporte anticipado', 'Excursión día completo'],
    '{"phone": "+598 42 440 512"}'::jsonb
),
(
    'Faro de José Ignacio',
    'Histórico faro de 1877 con vistas panorámicas de 360°',
    -34.8333, -54.6167,
    'José Ignacio, Maldonado',
    NULL, NULL, NULL,
    'Monumentos',
    '["https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200"]'::jsonb,
    '{"monday": "Cerrado", "tuesday": "10:00-13:00", "wednesday": "10:00-13:00", "thursday": "10:00-13:00", "friday": "10:00-13:00", "saturday": "10:00-17:00", "sunday": "10:00-17:00"}'::jsonb,
    '$',
    ARRAY['Miradores', 'Estacionamiento'],
    ARRAY['Fotografía', 'Vistas panorámicas', 'Caminatas'],
    ARRAY['Subir al atardecer', 'Combinar con visita al pueblo', 'Llevar ropa abrigada'],
    '{}'::jsonb
),
(
    'Plaza Artigas Maldonado',
    'Plaza principal con arquitectura histórica y Catedral',
    -34.9056, -54.9583,
    'Plaza Artigas, Maldonado Centro',
    NULL, NULL, NULL,
    'Plazas',
    '["https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200"]'::jsonb,
    '{"monday": "00:00-23:59", "tuesday": "00:00-23:59", "wednesday": "00:00-23:59", "thursday": "00:00-23:59", "friday": "00:00-23:59", "saturday": "00:00-23:59", "sunday": "00:00-23:59"}'::jsonb,
    'Gratis',
    ARRAY['Bancos', 'Iluminación', 'Juegos infantiles'],
    ARRAY['Caminatas', 'Eventos culturales', 'Ferias', 'Fotografía'],
    ARRAY['Visita la Catedral del siglo XVIII', 'Sábados hay feria artesanal'],
    '{}'::jsonb
),
(
    'Laguna del Sauce',
    'Mayor laguna del departamento, ideal para deportes náuticos',
    -34.8167, -55.0167,
    'Ruta 10, Maldonado',
    NULL, NULL, NULL,
    'Naturaleza',
    '["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200"]'::jsonb,
    '{"monday": "00:00-23:59", "tuesday": "00:00-23:59", "wednesday": "00:00-23:59", "thursday": "00:00-23:59", "friday": "00:00-23:59", "saturday": "00:00-23:59", "sunday": "00:00-23:59"}'::jsonb,
    'Gratis',
    ARRAY['Accesos públicos', 'Áreas picnic', 'Miradores'],
    ARRAY['Vela', 'Windsurf', 'Kayak', 'Pesca', 'Observación de aves'],
    ARRAY['Excelente para windsurf', 'Mejor época para aves: primavera'],
    '{}'::jsonb
);

-- ============================================================================
-- EVENTOS (8 eventos)
-- ============================================================================

INSERT INTO events (title, description, start_date, end_date, time, location, address, lat, lng, category, price, capacity, organizer, image, gallery, tags, contact) VALUES
(
    'Festival Internacional de Jazz',
    'Conciertos al aire libre con artistas de renombre internacional',
    '2026-01-15 20:00:00', '2026-01-22 23:00:00', '20:00',
    'Conrad Hotel', 'Parada 4, Playa Mansa', -34.9444, -54.9503,
    'Música', 'Gratis - $150', 5000,
    'Intendencia de Maldonado',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=1200',
    ARRAY['https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800'],
    ARRAY['Música', 'Jazz', 'Internacional'],
    '{"phone": "+598 42 440 512", "email": "cultura@maldonado.gub.uy", "website": "https://jazzpuntadeleste.com"}'::jsonb
),
(
    'Maratón de Punta del Este',
    '42K, 21K y 10K por las costas más lindas del Uruguay',
    '2026-03-08 07:00:00', '2026-03-08 14:00:00', '07:00',
    'Plaza Artigas', 'Gorlero y Av. Del Mar', -34.9511, -54.9475,
    'Deportes', '$50 - $80', 8000,
    'Club de Atletismo Maldonado',
    'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=1200',
    ARRAY[]::text[],
    ARRAY['Deportes', 'Running', 'Maratón'],
    '{"phone": "+598 42 486 000", "email": "info@maratonpuntadeleste.com"}'::jsonb
),
(
    'Feria de Artesanos',
    'Productos artesanales locales, gastronomía y música en vivo',
    '2025-12-01 18:00:00', '2026-03-31 23:00:00', '18:00',
    'Plaza Artigas', 'Gorlero y Av. Del Mar', -34.9511, -54.9475,
    'Ferias', 'Gratis', NULL,
    'Asociación de Artesanos',
    'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=1200',
    ARRAY[]::text[],
    ARRAY['Artesanías', 'Cultura', 'Familia'],
    '{"email": "artesanosmaldonado@gmail.com"}'::jsonb
),
(
    'Festival de Cine',
    'Proyecciones de cine internacional y encuentros con directores',
    '2026-02-10 19:00:00', '2026-02-17 23:00:00', '19:00',
    'Cines del Conrad', 'Varias locaciones', -34.9511, -54.9475,
    'Cultura', '$10 - $25', 3000,
    'Cinemateca Uruguaya',
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200',
    ARRAY[]::text[],
    ARRAY['Cine', 'Cultura', 'Arte'],
    '{"phone": "+598 2419 5795", "email": "info@festivalcine.com"}'::jsonb
),
(
    'Año Nuevo en Punta del Este',
    'Espectáculo de fuegos artificiales y fiestas',
    '2025-12-31 21:00:00', '2026-01-01 06:00:00', '21:00',
    'Playas', 'Península', -34.9511, -54.9475,
    'Celebraciones', 'Gratis', NULL,
    'Intendencia de Maldonado',
    'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=1200',
    ARRAY[]::text[],
    ARRAY['Año Nuevo', 'Fiesta', 'Fuegos'],
    '{"phone": "+598 42 440 512"}'::jsonb
),
(
    'Torneo Internacional de Tenis',
    'Competencia ATP con los mejores tenistas',
    '2026-01-03 10:00:00', '2026-01-10 20:00:00', '10:00',
    'Cantegril Country Club', 'Cantegril', -34.9297, -54.9172,
    'Deportes', '$30 - $100', 2000,
    'Asociación Uruguaya de Tenis',
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200',
    ARRAY[]::text[],
    ARRAY['Tenis', 'Deportes', 'ATP'],
    '{"phone": "+598 42 484 242"}'::jsonb
),
(
    'Carnaval de José Ignacio',
    'Desfile de comparsas y murgas con música',
    '2026-02-20 20:00:00', '2026-02-25 23:00:00', '20:00',
    'José Ignacio', 'Calles de José Ignacio', -34.8333, -54.6167,
    'Cultura', 'Gratis', NULL,
    'Comisión de Fiestas',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200',
    ARRAY[]::text[],
    ARRAY['Carnaval', 'Murga', 'Tradición'],
    '{"email": "carnavaljoseignacio@gmail.com"}'::jsonb
),
(
    'Feria Gastronómica',
    'Showcooking, degustaciones y productos gourmet',
    '2026-04-10 11:00:00', '2026-04-12 20:00:00', '11:00',
    'Plaza Maldonado', 'Plaza Artigas', -34.9056, -54.9583,
    'Gastronomía', '$5', NULL,
    'Asociación de Chefs',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200',
    ARRAY[]::text[],
    ARRAY['Gastronomía', 'Cocina', 'Food'],
    '{"email": "feriagastronomica@maldonado.gub.uy"}'::jsonb
);

-- ============================================================================
-- NOTICIAS (8 artículos)
-- ============================================================================

INSERT INTO news (title, summary, content, category, author, image, tags, featured, views, published_at) VALUES
(
    'Inauguración del nuevo paseo costero en Playa Mansa',
    'La Intendencia inauguró el nuevo paseo de 2 km con bicisenda',
    E'La Intendencia de Maldonado inauguró el nuevo paseo costero de Playa Mansa.\n\nLa obra incluye bicisenda de 3 metros, sendero peatonal con LED, estaciones de ejercicio, áreas de descanso y miradores.\n\n"Este paseo transforma la experiencia de residentes y visitantes", declaró el Intendente.',
    'Infraestructura', 'Prensa Intendencia',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200',
    ARRAY['Infraestructura', 'Playa Mansa', 'Turismo'],
    true, 0, '2025-11-08 10:00:00'
),
(
    'Plan de forestación: 10.000 árboles nativos en 2026',
    'Ambicioso plan de forestación urbana con especies nativas',
    E'La Intendencia presentó su Plan de Forestación Urbana 2026 con 10.000 árboles nativos.\n\nPriorizará coronilla, ceibo, tala y anacahuita. Incluye 4.000 árboles en veredas, 3.000 en plazas y 2.000 en reservas.\n\nLas plantaciones comenzarán en marzo 2026.',
    'Medio Ambiente', 'Redacción',
    'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1200',
    ARRAY['Medio Ambiente', 'Forestación', 'Sustentabilidad'],
    true, 0, '2025-11-07 09:00:00'
),
(
    'Maldonado lidera ranking de turismo sustentable',
    'Primer lugar en destinos turísticos sustentables de Uruguay',
    E'Maldonado obtuvo el primer lugar en el Ranking Nacional de Destinos Turísticos Sustentables 2025.\n\nDestacó en gestión de residuos (65% reciclaje), protección territorial (15%) y certificaciones (45% establecimientos).\n\nLa distinción posiciona favorablemente al departamento en el mercado internacional.',
    'Turismo', 'Martín Rodríguez',
    'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=1200',
    ARRAY['Turismo', 'Sustentabilidad', 'Reconocimiento'],
    false, 0, '2025-11-06 11:00:00'
),
(
    'Nueva línea de transporte a José Ignacio',
    'Servicio directo operará desde diciembre con frecuencia cada 30 minutos',
    E'Nueva línea conectará José Ignacio con Punta del Este desde el 1 de diciembre.\n\nRecorrido de 35 km con paradas en Manantiales, La Barra y El Tesoro. Frecuencia cada 30 minutos en verano.\n\nUnidades con aire, WiFi, accesibilidad y capacidad para bicicletas. Tarifa: $3.50.',
    'Transporte', 'Laura Benítez',
    'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=1200',
    ARRAY['Transporte', 'José Ignacio', 'Movilidad'],
    false, 0, '2025-11-05 10:00:00'
),
(
    'Casapueblo cumple 50 años',
    'El museo celebra medio siglo con exposiciones y actividades especiales',
    E'Casapueblo celebra 50 años con programa especial.\n\nIncluye exposición "50 años, 50 obras", conferencias, ceremonias especiales y talleres.\n\nRecibe 200.000 visitantes anuales, tercera atracción más visitada de Uruguay.',
    'Cultura', 'Sofía Méndez',
    'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=1200',
    ARRAY['Cultura', 'Casapueblo', 'Arte', 'Aniversario'],
    false, 0, '2025-11-04 12:00:00'
),
(
    'Tecnología 5G llega a Punta del Este',
    'Antel completó despliegue de red 5G en todo el departamento',
    E'Antel finalizó el despliegue 5G en Maldonado, primer departamento del interior con cobertura completa.\n\nOfrece velocidades 20x superiores, latencia ultra baja y mayor capacidad. Inversión de 15 millones de dólares.\n\nHabilita streaming, realidad aumentada, gestión urbana inteligente y vehículos conectados.',
    'Tecnología', 'Diego Castro',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200',
    ARRAY['Tecnología', '5G', 'Innovación'],
    false, 0, '2025-11-03 14:00:00'
),
(
    'Avistamiento excepcional de ballenas en La Barra',
    'Grupo de 8 ballenas francas observado a 300 metros de la costa',
    E'Ocho ballenas francas australes avistadas frente a La Barra.\n\nIncluye 3 hembras con crías y 2 machos con comportamientos de juego. Observadas a solo 300 metros.\n\nLas ballenas visitan costas uruguayas entre julio y noviembre. Autoridades piden mantener 300m de distancia.',
    'Naturaleza', 'Ana Suárez',
    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200',
    ARRAY['Naturaleza', 'Ballenas', 'Fauna Marina'],
    false, 0, '2025-11-02 08:00:00'
),
(
    'Plan de Acción Climática 2026-2030',
    'Objetivos de carbono neutralidad y adaptación al cambio climático',
    E'Maldonado presentó su Plan de Acción Climática 2026-2030.\n\nObjetivos: reducir 40% emisiones, 50% energía renovable, proteger 20% territorio, eliminar plásticos.\n\nPresupuesto de 25 millones en 5 años. Incluye 12 programas en energía, transporte y biodiversidad.',
    'Medio Ambiente', 'Redacción',
    'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=1200',
    ARRAY['Cambio Climático', 'Sustentabilidad'],
    false, 0, '2025-11-01 10:00:00'
);

-- ============================================================================
-- TRANSPORTE - RUTAS (5 líneas)
-- ============================================================================

INSERT INTO bus_routes (name, description, color, frequency, schedule, stops) VALUES
('Línea 1 - Centro', 'Recorre centro de Punta del Este', '#FF6B6B', '15 minutos', '{"weekday": "06:00-23:00", "saturday": "07:00-23:00", "sunday": "08:00-22:00"}'::jsonb, ARRAY['Terminal', 'Plaza Artigas', 'Conrad']),
('Línea 2 - Maldonado', 'Conecta Maldonado con Punta del Este', '#4ECDC4', '20 minutos', '{"weekday": "05:30-23:30", "saturday": "06:00-23:00", "sunday": "07:00-22:00"}'::jsonb, ARRAY['Maldonado', 'Terminal PDE']),
('Línea 3 - La Barra', 'Servicio a La Barra y Manantiales', '#95E1D3', '30 minutos', '{"weekday": "07:00-21:00", "saturday": "08:00-22:00", "sunday": "09:00-20:00"}'::jsonb, ARRAY['Terminal', 'La Barra', 'Manantiales']),
('Línea 4 - José Ignacio', 'Nueva línea directa', '#F38181', '30-60 minutos', '{"weekday": "07:00-20:00", "saturday": "08:00-21:00", "sunday": "09:00-19:00"}'::jsonb, ARRAY['Terminal', 'La Barra', 'José Ignacio']),
('Línea 5 - Punta Ballena', 'Servicio a Casapueblo', '#AA96DA', '40 minutos', '{"weekday": "08:00-19:00", "saturday": "09:00-20:00", "sunday": "10:00-18:00"}'::jsonb, ARRAY['Terminal', 'Punta Ballena', 'Casapueblo']);

-- ============================================================================
-- TRANSPORTE - PARADAS (8 paradas)
-- ============================================================================

INSERT INTO bus_stops (name, address, lat, lng, routes, facilities) VALUES
('Terminal Punta del Este', 'Av. Italia y Bulevar Artigas', -34.9511, -54.9475, ARRAY['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5'], ARRAY['Baños', 'Cafetería', 'WiFi']),
('Plaza Artigas PDE', 'Gorlero y Calle 24', -34.9520, -54.9470, ARRAY['Línea 1', 'Línea 2'], ARRAY['Bancos', 'WiFi']),
('Conrad Hotel', 'Parada 4', -34.9444, -54.9503, ARRAY['Línea 1'], ARRAY['WiFi']),
('Plaza Maldonado', 'Centro Maldonado', -34.9056, -54.9583, ARRAY['Línea 2'], ARRAY['Bancos', 'Baños', 'WiFi']),
('Puente La Barra', 'Ruta 10 km 161', -34.9053, -54.8306, ARRAY['Línea 3', 'Línea 4'], ARRAY['Estacionamiento']),
('Manantiales', 'Ruta 10 km 164', -34.8667, -54.7667, ARRAY['Línea 3', 'Línea 4'], ARRAY[]::text[]),
('José Ignacio', 'Plaza', -34.8333, -54.6167, ARRAY['Línea 4'], ARRAY['Baños']),
('Casapueblo', 'Punta Ballena', -34.9167, -54.8833, ARRAY['Línea 5'], ARRAY['Estacionamiento', 'Cafetería']);

-- ============================================================================
-- TRANSPORTE - ALERTAS (3 alertas)
-- ============================================================================

INSERT INTO transport_alerts (title, message, type, affected_routes, start_date, end_date) VALUES
('Horarios extendidos temporada alta', 'Todas las líneas extienden horarios desde 15 diciembre hasta 15 marzo. Consultar horarios especiales.', 'info', ARRAY['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4', 'Línea 5'], '2025-12-15 00:00:00', '2026-03-15 23:59:59'),
('Desvío Línea 2 por obras', 'Desvío temporal por obras en Av. Roosevelt. Paradas alternativas habilitadas.', 'warning', ARRAY['Línea 2'], '2025-11-10 00:00:00', '2025-11-30 23:59:59'),
('Nueva Línea 4 a José Ignacio', 'Desde 1 diciembre. Frecuencia cada 30 min en verano, cada hora resto del año.', 'info', ARRAY['Línea 4'], '2025-12-01 00:00:00', '2026-03-31 23:59:59');

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

SELECT 
    '✅ Seed completado' AS status,
    (SELECT COUNT(*) FROM places) AS lugares,
    (SELECT COUNT(*) FROM events) AS eventos,
    (SELECT COUNT(*) FROM news) AS noticias,
    (SELECT COUNT(*) FROM bus_routes) AS rutas,
    (SELECT COUNT(*) FROM bus_stops) AS paradas,
    (SELECT COUNT(*) FROM transport_alerts) AS alertas;
