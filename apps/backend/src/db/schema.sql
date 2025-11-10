-- Plataforma Digital Maldonado Turismo
-- Database Schema - Fase 1 MVP
-- PostgreSQL 15+ con PostGIS

-- ============================================================================
-- EXTENSIONES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- USUARIOS Y ROLES
-- ============================================================================

CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    department_id INT REFERENCES departments(id),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

-- ============================================================================
-- CATÁLOGOS
-- ============================================================================

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('lugar', 'evento', 'comercio')),
    slug VARCHAR(100) NOT NULL,
    parent_id INT REFERENCES categories(id),
    icon VARCHAR(50),
    color VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, slug)
);

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, type)
);

-- ============================================================================
-- LUGARES / PUNTOS DE INTERÉS
-- ============================================================================

CREATE TABLE places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    geom GEOGRAPHY(Point, 4326),
    address VARCHAR(500),
    phone VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(500),
    category_id INT REFERENCES categories(id),
    images JSONB DEFAULT '[]',
    is_public BOOLEAN DEFAULT true,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_places_geom ON places USING GIST(geom);
CREATE INDEX idx_places_category ON places(category_id);
CREATE INDEX idx_places_is_public ON places(is_public);

CREATE TABLE place_translations (
    id SERIAL PRIMARY KEY,
    place_id INT REFERENCES places(id) ON DELETE CASCADE,
    locale VARCHAR(5) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    UNIQUE(place_id, locale)
);

CREATE TABLE place_tags (
    place_id INT REFERENCES places(id) ON DELETE CASCADE,
    tag_id INT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (place_id, tag_id)
);

-- ============================================================================
-- AGENDA / EVENTOS
-- ============================================================================

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    venue_place_id INT REFERENCES places(id),
    start_ts TIMESTAMP NOT NULL,
    end_ts TIMESTAMP,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_rule VARCHAR(255),
    price VARCHAR(100),
    booking_url VARCHAR(500),
    organizer VARCHAR(255),
    images JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_start_ts ON events(start_ts);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_venue ON events(venue_place_id);

CREATE TABLE event_translations (
    id SERIAL PRIMARY KEY,
    event_id INT REFERENCES events(id) ON DELETE CASCADE,
    locale VARCHAR(5) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    UNIQUE(event_id, locale)
);

CREATE TABLE event_categories (
    event_id INT REFERENCES events(id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, category_id)
);

CREATE TABLE event_tags (
    event_id INT REFERENCES events(id) ON DELETE CASCADE,
    tag_id INT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, tag_id)
);

-- ============================================================================
-- TRANSPORTE (GTFS-lite)
-- ============================================================================

CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(20),
    text_color VARCHAR(20),
    agency VARCHAR(255) DEFAULT 'Maldonado Bus',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stops (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    geom GEOGRAPHY(Point, 4326),
    shelter BOOLEAN DEFAULT false,
    municipality_zone VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stops_geom ON stops USING GIST(geom);
CREATE INDEX idx_stops_code ON stops(code);

CREATE TABLE trips (
    id SERIAL PRIMARY KEY,
    route_id INT REFERENCES routes(id) ON DELETE CASCADE,
    service_days VARCHAR(7) DEFAULT '1111111',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stop_times (
    id SERIAL PRIMARY KEY,
    trip_id INT REFERENCES trips(id) ON DELETE CASCADE,
    stop_id INT REFERENCES stops(id) ON DELETE CASCADE,
    arrival_time TIME NOT NULL,
    departure_time TIME NOT NULL,
    sequence INT NOT NULL,
    UNIQUE(trip_id, sequence)
);

CREATE INDEX idx_stop_times_trip ON stop_times(trip_id);
CREATE INDEX idx_stop_times_stop ON stop_times(stop_id);

CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    route_id INT REFERENCES routes(id) ON DELETE SET NULL,
    effective_from TIMESTAMP NOT NULL,
    effective_to TIMESTAMP,
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_effective ON alerts(effective_from, effective_to);

-- ============================================================================
-- QR & TRACKING
-- ============================================================================

CREATE TABLE qr_codes (
    id SERIAL PRIMARY KEY,
    target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('stop', 'place', 'event')),
    target_id INT NOT NULL,
    short_code VARCHAR(20) NOT NULL UNIQUE,
    signed_url TEXT NOT NULL,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX idx_qr_codes_target ON qr_codes(target_type, target_id);
CREATE INDEX idx_qr_codes_short_code ON qr_codes(short_code);

CREATE TABLE qr_scans (
    id SERIAL PRIMARY KEY,
    qr_code_id INT REFERENCES qr_codes(id) ON DELETE CASCADE,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    lang VARCHAR(5),
    geoip_city VARCHAR(100),
    referrer TEXT
);

CREATE INDEX idx_qr_scans_qr_code ON qr_scans(qr_code_id);
CREATE INDEX idx_qr_scans_scanned_at ON qr_scans(scanned_at);

-- ============================================================================
-- COMUNICACIONES
-- ============================================================================

CREATE TABLE news (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body_md TEXT,
    images JSONB DEFAULT '[]',
    publish_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    author_user_id INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_news_status ON news(status);
CREATE INDEX idx_news_publish_at ON news(publish_at);

CREATE TABLE news_translations (
    id SERIAL PRIMARY KEY,
    news_id INT REFERENCES news(id) ON DELETE CASCADE,
    locale VARCHAR(5) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body_md TEXT,
    UNIQUE(news_id, locale)
);

CREATE TABLE banners (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL,
    target_url TEXT,
    start_ts TIMESTAMP NOT NULL,
    end_ts TIMESTAMP,
    placement VARCHAR(50) DEFAULT 'home' CHECK (placement IN ('home', 'map', 'agenda')),
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_banners_active ON banners(start_ts, end_ts);

CREATE TABLE press_releases (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body_md TEXT,
    attachments JSONB DEFAULT '[]',
    publish_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    area_owner INT REFERENCES departments(id),
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ANALÍTICA Y AUDITORÍA
-- ============================================================================

CREATE TABLE event_log (
    id SERIAL PRIMARY KEY,
    actor_user_id INT REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id INT,
    payload_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_log_actor ON event_log(actor_user_id);
CREATE INDEX idx_event_log_entity ON event_log(entity, entity_id);
CREATE INDEX idx_event_log_created_at ON event_log(created_at);

CREATE TABLE metrics_daily (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    page_views INT DEFAULT 0,
    unique_users INT DEFAULT 0,
    qr_scans INT DEFAULT 0,
    top_entities_json JSONB
);

-- ============================================================================
-- SEEDS INICIALES
-- ============================================================================

-- Departamentos
INSERT INTO departments (name, description) VALUES
    ('Informática', 'Departamento de Informática y Sistemas'),
    ('Turismo', 'Departamento de Turismo'),
    ('Cultura', 'Departamento de Cultura'),
    ('Transporte', 'Departamento de Transporte'),
    ('Prensa', 'Departamento de Prensa y Comunicaciones');

-- Roles
INSERT INTO roles (code, name, description) VALUES
    ('admin_sis', 'Administrador de Sistema', 'Acceso completo al sistema'),
    ('turismo', 'Gestor de Turismo', 'Gestiona lugares turísticos'),
    ('cultura', 'Gestor de Cultura', 'Gestiona eventos culturales'),
    ('transporte', 'Gestor de Transporte', 'Gestiona transporte público'),
    ('prensa', 'Gestor de Prensa', 'Gestiona noticias y comunicados'),
    ('lectura', 'Solo Lectura', 'Acceso de solo lectura a reportes');

-- Categorías de lugares
INSERT INTO categories (type, slug, icon, color) VALUES
    ('lugar', 'plazas', 'map-pin', '#22c55e'),
    ('lugar', 'playas', 'umbrella', '#3b82f6'),
    ('lugar', 'museos', 'building', '#8b5cf6'),
    ('lugar', 'restaurantes', 'utensils', '#ef4444'),
    ('evento', 'musica', 'music', '#f59e0b'),
    ('evento', 'deportes', 'football', '#10b981'),
    ('evento', 'cultura', 'palette', '#ec4899');

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_places_updated_at BEFORE UPDATE ON places
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stops_updated_at BEFORE UPDATE ON stops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_updated_at BEFORE UPDATE ON news
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
