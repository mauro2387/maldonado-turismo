-- ============================================================================
-- ADMIN TABLES - Sistema de Autenticación y Auditoría
-- Para ejecutar en Supabase después de supabase-schema.sql
-- ============================================================================

-- ============================================================================
-- USUARIOS ADMINISTRATIVOS
-- ============================================================================

CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin_sis', 'turismo', 'cultura', 'transporte', 'prensa', 'lectura')),
    department VARCHAR(100),
    active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para admin_users
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);
CREATE INDEX idx_admin_users_active ON admin_users(active) WHERE active = true;

-- ============================================================================
-- LOG DE AUDITORÍA
-- ============================================================================

CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES admin_users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    action VARCHAR(50) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'login', 'logout')),
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para audit_log
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger para updated_at en admin_users
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DATOS INICIALES - Usuario Admin por Defecto
-- ============================================================================

-- Contraseña: Admin123! (cambiar en producción)
-- Hash generado con bcrypt rounds=10
INSERT INTO admin_users (email, password_hash, name, role, department, active) VALUES
('admin@maldonado.gub.uy', '$2b$10$CbR1J1QNqTLuQfCagCN0teD27bxXEPWnavHswD4PJChlaRKvKesfq', 'Administrador Sistema', 'admin_sis', 'Informática', true);

-- ============================================================================
-- COMENTARIOS
-- ============================================================================

COMMENT ON TABLE admin_users IS 'Usuarios del panel administrativo con diferentes roles y permisos';
COMMENT ON TABLE audit_log IS 'Registro de todas las acciones realizadas en el sistema para auditoría';

COMMENT ON COLUMN admin_users.role IS 'Roles: admin_sis (full), turismo, cultura, transporte, prensa, lectura (read-only)';
COMMENT ON COLUMN audit_log.changes IS 'JSONB con datos antes/después del cambio para tracking detallado';

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

SELECT 
    '✅ Admin schema creado' AS status,
    (SELECT COUNT(*) FROM admin_users) AS usuarios_admin;
