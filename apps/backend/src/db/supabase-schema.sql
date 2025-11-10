-- ============================================================================
-- MALDONADO TURISMO - DATABASE SCHEMA
-- Optimizado para Supabase (PostgreSQL + PostGIS)
-- ============================================================================

-- Las extensiones ya vienen habilitadas en Supabase
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "postgis";
-- CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- LUGARES / PUNTOS DE INTERÉS (SIMPLIFICADO)
-- ============================================================================

CREATE TABLE places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    address VARCHAR(500),
    phone VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(500),
    category VARCHAR(100),
    images JSONB DEFAULT '[]',
    schedule JSONB,
    price_range VARCHAR(50),
    facilities TEXT[],
    activities TEXT[],
    tips TEXT[],
    contact JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_places_category ON places(category);
CREATE INDEX idx_places_name ON places USING gin(to_tsvector('spanish', name));

-- ============================================================================
-- EVENTOS
-- ============================================================================

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    long_description TEXT,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,
    start_time TIME,
    end_time TIME,
    time VARCHAR(20),
    location VARCHAR(255),
    address VARCHAR(500),
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    category VARCHAR(100),
    price VARCHAR(100),
    capacity INT,
    attendees INT DEFAULT 0,
    organizer VARCHAR(255),
    image VARCHAR(500),
    image_url VARCHAR(500),
    gallery TEXT[],
    tags TEXT[],
    contact JSONB,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_start_date ON events(start_date);
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_events_title ON events USING gin(to_tsvector('spanish', title));

-- ============================================================================
-- NOTICIAS
-- ============================================================================

CREATE TABLE news (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    content TEXT,
    category VARCHAR(100),
    author VARCHAR(255),
    author_image VARCHAR(500),
    location VARCHAR(255),
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    image VARCHAR(500),
    image_url VARCHAR(500),
    gallery TEXT[],
    tags TEXT[],
    featured BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    views INT DEFAULT 0,
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_news_published_at ON news(published_at DESC);
CREATE INDEX idx_news_featured ON news(featured) WHERE featured = true;
CREATE INDEX idx_news_category ON news(category);
CREATE INDEX idx_news_title ON news USING gin(to_tsvector('spanish', title));

-- ============================================================================
-- TRANSPORTE - PARADAS
-- ============================================================================

CREATE TABLE bus_stops (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    routes TEXT[],
    facilities TEXT[],
    distance DECIMAL(10, 2),
    next_buses JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bus_stops_name ON bus_stops(name);

-- ============================================================================
-- TRANSPORTE - RUTAS
-- ============================================================================

CREATE TABLE bus_routes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(20),
    frequency VARCHAR(100),
    schedule JSONB,
    stops TEXT[],
    path JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TRANSPORTE - ALERTAS
-- ============================================================================

CREATE TABLE transport_alerts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'danger')),
    affected_routes TEXT[],
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transport_alerts_dates ON transport_alerts(start_date, end_date);
CREATE INDEX idx_transport_alerts_type ON transport_alerts(type);

-- ============================================================================
-- TRIGGERS PARA UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_places_updated_at BEFORE UPDATE ON places
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_updated_at BEFORE UPDATE ON news
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bus_stops_updated_at BEFORE UPDATE ON bus_stops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bus_routes_updated_at BEFORE UPDATE ON bus_routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transport_alerts_updated_at BEFORE UPDATE ON transport_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGER PARA AUTO-INCREMENTAR VISTAS EN NOTICIAS
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_news_views()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE news SET views = views + 1 WHERE id = NEW.id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Este trigger se activará desde la aplicación cuando se lea una noticia
