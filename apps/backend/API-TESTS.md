# Admin API - Tests

## 🔐 Autenticación

### 1. Login
```bash
POST http://localhost:3000/api/v1/admin/auth/login
Content-Type: application/json

{
  "email": "admin@maldonado.gub.uy",
  "password": "Admin123!"
}
```

**Respuesta esperada:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@maldonado.gub.uy",
    "name": "Administrador Sistema",
    "role": "admin_sis",
    "department": "Informática"
  }
}
```

### 2. Perfil (requiere JWT)
```bash
GET http://localhost:3000/api/v1/admin/auth/profile
Authorization: Bearer <access_token>
```

### 3. Logout (requiere JWT)
```bash
POST http://localhost:3000/api/v1/admin/auth/logout
Authorization: Bearer <access_token>
```

---

## 📍 CRUD Lugares (rol: admin_sis o turismo)

### Crear Lugar
```bash
POST http://localhost:3000/api/v1/places
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Museo Regional Francisco Mazzoni",
  "description": "Museo con historia local y regional",
  "category": "museo",
  "address": "25 de Mayo 720",
  "coordinates": {
    "lat": -34.9077,
    "lng": -54.9594
  },
  "phone": "+598 4222 2229",
  "email": "museo@maldonado.gub.uy",
  "website": "https://maldonado.gub.uy/museo",
  "opening_hours": {
    "lunes": "9:00-17:00",
    "martes": "9:00-17:00",
    "miércoles": "9:00-17:00",
    "jueves": "9:00-17:00",
    "viernes": "9:00-17:00",
    "sábado": "cerrado",
    "domingo": "cerrado"
  },
  "accessibility_features": ["rampa", "baño_adaptado"],
  "tags": ["cultura", "historia", "educativo"],
  "featured": true
}
```

### Actualizar Lugar
```bash
PUT http://localhost:3000/api/v1/places/1
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Museo Regional Francisco Mazzoni - Actualizado",
  "featured": false
}
```

### Eliminar Lugar
```bash
DELETE http://localhost:3000/api/v1/places/1
Authorization: Bearer <access_token>
```

---

## 📅 CRUD Eventos (rol: admin_sis o cultura)

### Crear Evento
```bash
POST http://localhost:3000/api/v1/events
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "title": "Festival de Jazz 2025",
  "description": "Festival anual de jazz con artistas internacionales",
  "category": "musica",
  "start_date": "2025-12-15T20:00:00Z",
  "end_date": "2025-12-18T23:00:00Z",
  "location": "Teatro Municipal",
  "coordinates": {
    "lat": -34.9077,
    "lng": -54.9594
  },
  "organizer": "Departamento de Cultura",
  "contact_email": "cultura@maldonado.gub.uy",
  "contact_phone": "+598 4222 2200",
  "price": "Entrada libre",
  "capacity": 500,
  "registration_required": true,
  "registration_url": "https://maldonado.gub.uy/eventos/jazz2025",
  "tags": ["música", "festival", "cultura"],
  "featured": true
}
```

### Actualizar Evento
```bash
PUT http://localhost:3000/api/v1/events/1
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "capacity": 600,
  "price": "$500"
}
```

### Eliminar Evento
```bash
DELETE http://localhost:3000/api/v1/events/1
Authorization: Bearer <access_token>
```

---

## 📰 CRUD Noticias (rol: admin_sis o prensa)

### Crear Noticia
```bash
POST http://localhost:3000/api/v1/news
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "title": "Nueva inversión en infraestructura turística",
  "summary": "Se anunciaron importantes mejoras para la temporada 2026",
  "content": "La Intendencia de Maldonado anunció hoy una inversión de $50 millones en infraestructura turística...",
  "category": "gobierno",
  "author": "Prensa Intendencia",
  "image_url": "https://example.com/image.jpg",
  "tags": ["turismo", "inversión", "infraestructura"],
  "featured": true,
  "published": true
}
```

### Actualizar Noticia
```bash
PUT http://localhost:3000/api/v1/news/1
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "title": "Nueva inversión en infraestructura turística - ACTUALIZADO",
  "published": false
}
```

### Eliminar Noticia
```bash
DELETE http://localhost:3000/api/v1/news/1
Authorization: Bearer <access_token>
```

---

## 🚌 CRUD Transporte (rol: admin_sis o transporte)

### Rutas

**Crear Ruta:**
```bash
POST http://localhost:3000/api/v1/transport/routes
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "route_number": "101",
  "name": "Maldonado - Punta del Este",
  "description": "Ruta urbana centro-balneario",
  "operator": "COME Maldonado",
  "type": "urbano",
  "color": "#FF5733",
  "active": true
}
```

**Actualizar Ruta:**
```bash
PUT http://localhost:3000/api/v1/transport/routes/1
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Maldonado - Punta del Este Express"
}
```

**Eliminar Ruta:**
```bash
DELETE http://localhost:3000/api/v1/transport/routes/1
Authorization: Bearer <access_token>
```

### Paradas

**Crear Parada:**
```bash
POST http://localhost:3000/api/v1/transport/stops
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Terminal Maldonado",
  "coordinates": {
    "lat": -34.9077,
    "lng": -54.9594
  },
  "address": "Av. Roosevelt y 18 de Julio",
  "shelter": true,
  "bench": true,
  "lighting": true,
  "accessibility": true
}
```

**Actualizar Parada:**
```bash
PUT http://localhost:3000/api/v1/transport/stops/1
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "shelter": false
}
```

**Eliminar Parada:**
```bash
DELETE http://localhost:3000/api/v1/transport/stops/1
Authorization: Bearer <access_token>
```

### Alertas

**Crear Alerta:**
```bash
POST http://localhost:3000/api/v1/transport/alerts
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "title": "Desvío temporal Ruta 101",
  "message": "Debido a obras en Av. Roosevelt, la ruta 101 circula por vías alternativas",
  "type": "desvio",
  "severity": "media",
  "affected_routes": [1, 2, 3],
  "start_date": "2025-11-10T00:00:00Z",
  "end_date": "2025-11-20T23:59:59Z",
  "active": true
}
```

**Actualizar Alerta:**
```bash
PUT http://localhost:3000/api/v1/transport/alerts/1
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "severity": "alta",
  "active": false
}
```

**Eliminar Alerta:**
```bash
DELETE http://localhost:3000/api/v1/transport/alerts/1
Authorization: Bearer <access_token>
```

---

## 🔍 Verificación de Audit Log

Después de realizar operaciones, verificar en Supabase:

```sql
SELECT * FROM audit_log 
ORDER BY created_at DESC 
LIMIT 10;
```

Debería mostrar:
- user_id, user_email
- action (create/update/delete/login/logout)
- entity_type (place/event/news/route/stop/alert)
- changes (JSONB con before/after)
- ip_address
- created_at

---

## 📋 Script SQL para Verificar Tablas

```sql
-- Verificar usuario admin
SELECT id, email, name, role, department, active 
FROM admin_users;

-- Verificar audit log
SELECT 
  al.id,
  au.email as user_email,
  al.action,
  al.entity_type,
  al.entity_id,
  al.ip_address,
  al.created_at
FROM audit_log al
LEFT JOIN admin_users au ON al.user_id = au.id
ORDER BY al.created_at DESC
LIMIT 20;
```

---

## ⚠️ Códigos de Error Esperados

- **401 Unauthorized**: Token JWT inválido o expirado
- **403 Forbidden**: Usuario no tiene permisos para la operación (rol insuficiente)
- **404 Not Found**: Entidad no existe
- **400 Bad Request**: Datos inválidos en el body

---

## 🎯 Orden Recomendado de Pruebas

1. ✅ Login → Obtener JWT token
2. ✅ Profile → Verificar autenticación
3. ✅ Crear un lugar → Verificar CRUD y audit log
4. ✅ Actualizar el lugar → Ver changes en JSONB
5. ✅ Eliminar el lugar → Confirmar soft/hard delete
6. ✅ Crear evento, noticia, ruta → Probar otros módulos
7. ✅ Logout → Verificar token invalidation (si implementado)
8. ✅ Intentar operación con token expirado → Error 401
