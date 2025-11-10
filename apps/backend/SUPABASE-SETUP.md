# 🗄️ Configuración Base de Datos - Supabase

## Pasos para ejecutar el SQL de Admin

### 1. Abrir Supabase Dashboard
1. Ir a https://supabase.com/dashboard
2. Seleccionar tu proyecto
3. En el menú lateral, ir a **SQL Editor**

### 2. Ejecutar el Script
1. Copiar el contenido completo de `apps/backend/src/db/admin-schema.sql`
2. Pegarlo en el SQL Editor
3. Hacer click en **Run** (o presionar Ctrl+Enter)

### 3. Verificar la Creación
Deberías ver al final del output:
```
✅ Admin schema creado
usuarios_admin: 1
```

### 4. Script de Verificación Manual
Si querés verificar manualmente, ejecutá en el SQL Editor:

```sql
-- Ver usuario admin creado
SELECT 
  id, 
  email, 
  name, 
  role, 
  department, 
  active,
  created_at
FROM admin_users;

-- Resultado esperado:
-- id: 1
-- email: admin@maldonado.gub.uy
-- name: Administrador Sistema
-- role: admin_sis
-- department: Informática
-- active: true
```

---

## 📋 Contenido del Script (admin-schema.sql)

El script crea:

### Tabla `admin_users`
- **id**: Serial (auto-increment)
- **email**: VARCHAR(255) UNIQUE
- **password_hash**: VARCHAR(255) - Hash bcrypt de la contraseña
- **name**: VARCHAR(255)
- **role**: VARCHAR(50) - CHECK constraint para 6 roles válidos
- **department**: VARCHAR(100)
- **active**: BOOLEAN
- **last_login**: TIMESTAMP
- **created_at**, **updated_at**: TIMESTAMP

**Roles válidos:**
- `admin_sis` - Acceso completo a todo
- `turismo` - CRUD de lugares
- `cultura` - CRUD de eventos
- `transporte` - CRUD de transporte (rutas/paradas/alertas)
- `prensa` - CRUD de noticias
- `lectura` - Solo lectura (GET endpoints)

**Índices:**
- idx_admin_users_email
- idx_admin_users_role
- idx_admin_users_active (partial index para active = true)

### Tabla `audit_log`
- **id**: Serial
- **user_id**: INT (FK a admin_users)
- **user_email**: VARCHAR(255)
- **action**: VARCHAR(50) - CHECK (create, update, delete, login, logout)
- **entity_type**: VARCHAR(50) - place, event, news, route, stop, alert
- **entity_id**: INT
- **changes**: JSONB - Objeto con before/after del cambio
- **ip_address**: VARCHAR(45)
- **user_agent**: TEXT
- **created_at**: TIMESTAMP

**Índices:**
- idx_audit_log_user_id
- idx_audit_log_action
- idx_audit_log_entity (compuesto: entity_type + entity_id)
- idx_audit_log_created_at (DESC para consultas recientes)

### Triggers
- `update_admin_users_updated_at`: Actualiza automáticamente `updated_at` al modificar un usuario

### Usuario Admin por Defecto
```
Email: admin@maldonado.gub.uy
Password: Admin123!
Hash: $2b$10$CbR1J1QNqTLuQfCagCN0teD27bxXEPWnavHswD4PJChlaRKvKesfq
Role: admin_sis
Department: Informática
```

**⚠️ IMPORTANTE:** Cambiar la contraseña del admin en producción.

---

## 🔍 Queries Útiles para Administración

### Ver todos los usuarios admin
```sql
SELECT 
  id,
  email,
  name,
  role,
  department,
  active,
  last_login,
  created_at
FROM admin_users
ORDER BY created_at DESC;
```

### Ver actividad reciente (últimas 50 acciones)
```sql
SELECT 
  al.id,
  au.name as usuario,
  au.email,
  al.action,
  al.entity_type,
  al.entity_id,
  al.ip_address,
  al.created_at
FROM audit_log al
LEFT JOIN admin_users au ON al.user_id = au.id
ORDER BY al.created_at DESC
LIMIT 50;
```

### Ver cambios específicos de una entidad
```sql
SELECT 
  au.name as usuario,
  al.action,
  al.changes,
  al.created_at
FROM audit_log al
LEFT JOIN admin_users au ON al.user_id = au.id
WHERE al.entity_type = 'place' 
  AND al.entity_id = 1
ORDER BY al.created_at DESC;
```

### Ver logins del último mes
```sql
SELECT 
  au.name,
  au.email,
  al.ip_address,
  al.created_at
FROM audit_log al
JOIN admin_users au ON al.user_id = au.id
WHERE al.action = 'login'
  AND al.created_at > NOW() - INTERVAL '30 days'
ORDER BY al.created_at DESC;
```

### Estadísticas de actividad por usuario
```sql
SELECT 
  au.name,
  au.role,
  COUNT(*) as total_acciones,
  COUNT(*) FILTER (WHERE al.action = 'create') as creaciones,
  COUNT(*) FILTER (WHERE al.action = 'update') as actualizaciones,
  COUNT(*) FILTER (WHERE al.action = 'delete') as eliminaciones,
  MAX(al.created_at) as ultima_actividad
FROM audit_log al
JOIN admin_users au ON al.user_id = au.id
WHERE al.action IN ('create', 'update', 'delete')
GROUP BY au.id, au.name, au.role
ORDER BY total_acciones DESC;
```

### Crear nuevo usuario admin (ejemplo)
```sql
-- Primero generar el hash con el script:
-- cd apps/backend
-- npx ts-node src/scripts/generate-password.ts MiPassword123

INSERT INTO admin_users (email, password_hash, name, role, department, active)
VALUES (
  'turismo@maldonado.gub.uy',
  '$2b$10$...', -- Reemplazar con el hash generado
  'Usuario Turismo',
  'turismo',
  'Secretaría de Turismo',
  true
);
```

### Desactivar usuario sin eliminarlo
```sql
UPDATE admin_users 
SET active = false 
WHERE email = 'usuario@example.com';
```

### Cambiar contraseña de usuario
```sql
-- 1. Generar nuevo hash con el script:
-- npx ts-node src/scripts/generate-password.ts NuevaPassword123

-- 2. Actualizar en la base de datos:
UPDATE admin_users 
SET password_hash = '$2b$10$...' -- Nuevo hash aquí
WHERE email = 'admin@maldonado.gub.uy';
```

---

## 🔐 Seguridad

### Contraseñas
- Todas las contraseñas se almacenan hasheadas con **bcrypt** (10 rounds)
- Nunca almacenar contraseñas en texto plano
- Usar el script `generate-password.ts` para crear hashes

### JWT Tokens
- Expiración: 8 horas (configurable en `.env`)
- Secret: Definido en `JWT_SECRET` en `.env`
- Algoritmo: HS256

### Roles y Permisos
- Verificados con `RolesGuard` en cada endpoint protegido
- Admin_sis tiene acceso completo
- Otros roles solo a sus módulos específicos
- Rol "lectura" solo puede hacer GET

### Audit Log
- Se registra **toda** acción administrativa
- Incluye IP address del cliente
- Cambios en formato JSONB (before/after)
- No se puede eliminar (solo para auditoría)

---

## ⚠️ Troubleshooting

### Error: "relation admin_users does not exist"
- El script no se ejecutó correctamente
- Re-ejecutar `admin-schema.sql` completo

### Error: "trigger function update_updated_at_column() does not exist"
- El trigger depende de una función de `supabase-schema.sql`
- Asegurar que `supabase-schema.sql` se ejecutó primero

### No puedo hacer login
- Verificar que el usuario existe: `SELECT * FROM admin_users WHERE email = '...'`
- Verificar que `active = true`
- Probar regenerar el hash de contraseña con el script

### Token JWT expirado
- Los tokens expiran en 8 horas
- Hacer login nuevamente para obtener nuevo token
- Considerar implementar refresh tokens para sesiones largas

---

## 📝 Próximos Pasos

Después de ejecutar el SQL:

1. ✅ Hacer login con `admin@maldonado.gub.uy` / `Admin123!`
2. ✅ Obtener JWT token
3. ✅ Probar endpoints CRUD con el token
4. ✅ Verificar audit_log
5. ✅ Crear usuarios adicionales con diferentes roles
6. ✅ Probar restricciones de permisos
