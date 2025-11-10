-- Crear usuario y base de datos
CREATE USER maldonado_user WITH PASSWORD 'dev_password_123';
CREATE DATABASE maldonado_turismo OWNER maldonado_user;

-- Otorgar privilegios
GRANT ALL PRIVILEGES ON DATABASE maldonado_turismo TO maldonado_user;

-- Conectar a la base de datos y habilitar extensiones
\c maldonado_turismo

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Otorgar permisos al usuario
GRANT ALL ON SCHEMA public TO maldonado_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO maldonado_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO maldonado_user;
