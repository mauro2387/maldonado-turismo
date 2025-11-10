# Arquitectura del Sistema - Maldonado Turismo

## Vista General

La plataforma está diseñada como un **monorepo** que contiene:

1. **Frontend**: Single Page Application (SPA) en React
2. **Backend**: API REST en NestJS
3. **Base de Datos**: PostgreSQL 15 con extensión PostGIS
4. **Storage**: MinIO (compatible S3)
5. **Proxy**: Nginx con SSL/TLS

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        USUARIOS                              │
│   (Ciudadanos, Turistas, Personal Municipal, Comercios)     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ HTTPS
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                     NGINX (Reverse Proxy)                    │
│  - SSL/TLS Termination                                       │
│  - Rate Limiting                                             │
│  - Caching estático                                          │
│  - Compression (gzip)                                        │
└────────┬───────────────────────────────┬────────────────────┘
         │                               │
         │ /api/*                        │ /*
         ▼                               ▼
┌─────────────────────┐       ┌──────────────────────────┐
│   BACKEND (NestJS)  │       │   FRONTEND (React)       │
│   Port: 3000        │       │   Nginx Static Server    │
│                     │       │   Port: 80               │
│   Módulos:          │       │                          │
│   - Auth & RBAC     │       │   Features:              │
│   - Lugares         │       │   - Home & Mapa          │
│   - Eventos         │       │   - Agenda               │
│   - Transporte      │       │   - Transporte           │
│   - Noticias        │       │   - Noticias             │
│   - QR Tracking     │       │   - Dashboard (Admin)    │
│   - Analítica       │       │                          │
└──────┬──────────────┘       └──────────────────────────┘
       │
       │ TypeORM
       ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL 15 + PostGIS                         │
│   Port: 5432                                                 │
│                                                              │
│   Schemas:                                                   │
│   - users, roles, departments                                │
│   - places, events, categories, tags                         │
│   - routes, stops, trips, stop_times, alerts                 │
│   - qr_codes, qr_scans                                       │
│   - news, banners, press_releases                            │
│   - event_log, metrics_daily                                 │
└─────────────────────────────────────────────────────────────┘
       │
       │ Storage
       ▼
┌─────────────────────────────────────────────────────────────┐
│                      MinIO (S3 Compatible)                   │
│   Port: 9000 (API), 9001 (Console)                          │
│                                                              │
│   Buckets:                                                   │
│   - maldonado-files (images, attachments, exports)          │
└─────────────────────────────────────────────────────────────┘
```

## Stack Tecnológico Detallado

### Frontend

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| React | 18.2 | Framework UI |
| Vite | 5.1 | Build tool & dev server |
| TailwindCSS | 3.4 | Styling mobile-first |
| React Router | 6.22 | Routing SPA |
| i18next | 23.8 | Internacionalización ES/EN |
| Zustand | 4.5 | State management |
| Axios | 1.6 | HTTP client |
| Leaflet | 1.9 | Mapas interactivos |
| Lucide React | 0.323 | Iconos |

### Backend

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| NestJS | 10.3 | Framework Node.js |
| TypeORM | 0.3 | ORM para PostgreSQL |
| Passport JWT | 4.0 | Autenticación |
| Swagger | 7.2 | Documentación API |
| Class Validator | 0.14 | Validación DTOs |
| Bcrypt | 5.1 | Hash de contraseñas |

### Base de Datos

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| PostgreSQL | 15 | Base de datos relacional |
| PostGIS | 3.4 | Extensión geoespacial |
| pg_trgm | - | Full-text search |

### Infraestructura

| Tecnología | Propósito |
|-----------|-----------|
| Docker | Containerización |
| Docker Compose | Orquestación local |
| Nginx | Reverse proxy, SSL, caching |
| MinIO | Object storage |

## Flujo de Datos

### 1. Autenticación

```
Usuario → Login Form → POST /api/v1/auth/login → Backend
                                                    ↓
                                              Valida credenciales
                                                    ↓
                                              Genera JWT + Refresh Token
                                                    ↓
Usuario ← Tokens ← Response 200 ← Backend
```

### 2. Consulta Pública (Lugares / Eventos)

```
Usuario → Browse → GET /api/v1/places?bbox=... → Backend
                                                    ↓
                                              Query PostgreSQL
                                              (con índice espacial)
                                                    ↓
Usuario ← JSON Response ← 200 OK ← Backend
```

### 3. Creación de Contenido (Backoffice)

```
Admin → Create Event Form → POST /api/v1/events
                                ↓ (JWT en header)
                          Valida JWT & Rol
                                ↓
                          Valida DTO (class-validator)
                                ↓
                          Inserta en DB
                                ↓
                          Registra event_log (auditoría)
                                ↓
Admin ← Evento creado ← 201 Created
```

### 4. Escaneo QR (Parada de Bus)

```
Usuario → Escanea QR → GET /qr/{short_code} → Backend
                                                 ↓
                                        Busca qr_code en DB
                                                 ↓
                                        Registra qr_scan
                                        (user_agent, lang, geo)
                                                 ↓
Usuario ← Redirect 302 ← /parada/:id
```

### 5. Mapa con Capas

```
Usuario → Abre Mapa → Activa capa "Turismo"
                            ↓
                  GET /api/v1/places?bbox=...&category=turismo
                            ↓
                      Backend devuelve GeoJSON
                            ↓
                  Leaflet renderiza pins en mapa
```

## Modelo de Seguridad

### Autenticación

- **Estrategia**: JWT con tokens de acceso (24h) y refresh (7 días)
- **Storage**: localStorage en frontend
- **Rotación**: Implementar rotación de secrets cada 90 días

### Autorización (RBAC)

| Rol | Permisos |
|-----|----------|
| **admin_sis** | Acceso total, gestión de usuarios |
| **turismo** | CRUD lugares, eventos turísticos |
| **cultura** | CRUD eventos culturales |
| **transporte** | CRUD rutas, paradas, alertas |
| **prensa** | CRUD noticias, banners, comunicados |
| **lectura** | Solo lectura en dashboards |

### Protección de Endpoints

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('turismo', 'admin_sis')
@Post('places')
createPlace(@Body() dto: CreatePlaceDto) {
  // Solo usuarios con rol "turismo" o "admin_sis"
}
```

### RLS (Row Level Security) en PostgreSQL

```sql
-- Ejemplo: usuarios solo ven su departamento
CREATE POLICY users_own_dept ON users
  USING (department_id = current_setting('app.current_user_dept')::int);
```

### Rate Limiting

Configurado en Nginx:
- `/api/*`: 100 requests/minuto
- `/qr/*`: 50 requests/minuto

## Escalabilidad

### Horizontal

- **Backend**: Stateless, puede escalar a N instancias con load balancer
- **Frontend**: CDN para assets estáticos (Cloudflare, AWS CloudFront)

### Vertical

- **PostgreSQL**: Índices optimizados (geom, timestamps), particionado de tablas grandes (`qr_scans`)
- **MinIO**: Modo distribuido para alta disponibilidad

### Caching

- **Nginx**: Cache de assets estáticos (1 año)
- **Redis (Fase 2)**: Cache de horarios de transporte, respuestas API frecuentes

## Monitoreo y Observabilidad

### Logs

- **Backend**: Logs estructurados en JSON
- **Nginx**: Access logs y error logs
- **Agregación**: Loki o ELK stack (producción)

### Métricas

- **Tabla `metrics_daily`**: page_views, unique_users, qr_scans
- **Prometheus + Grafana** (opcional on-prem)

### Alertas

- Notificación si:
  - API responde con >5% de errores 5xx
  - DB conexiones > 80% del pool
  - Disco > 85% de uso

## Integraciones Externas (Fase 3)

### Verlyx Systems

```
Backend → GET https://api.verlyx.com/v1/benefits
            ↓ (API Key en header)
        Recibe beneficios activos
            ↓
        Sincroniza con tabla `benefits`
```

### Mapas (Mapbox/MapTiler)

```
Frontend → Leaflet carga tiles de MapTiler
           https://api.maptiler.com/maps/{style}/{z}/{x}/{y}.png?key={token}
```

### Clima (Open-Meteo)

```
Frontend → GET https://api.open-meteo.com/v1/forecast?latitude=-34.97&longitude=-54.95
```

## Roadmap de Fases

### Fase 1 - MVP (8-10 semanas) ✅
- [x] Frontend mobile-first
- [x] Backend API con RBAC
- [x] Mapa con capas
- [x] Agenda de eventos
- [x] Transporte (paradas + horarios estáticos)
- [x] QR tracking
- [x] Backoffice básico

### Fase 2 - Transporte & Seguridad (6-8 semanas)
- [ ] GTFS-lite completo
- [ ] Alertas de transporte
- [ ] Auditoría completa
- [ ] PostGIS queries espaciales
- [ ] Backups automáticos

### Fase 3 - Verlyx + Comercios (8-12 semanas)
- [ ] Integración Verlyx
- [ ] Módulo de beneficios
- [ ] Panel de analítica avanzada
- [ ] SEO optimizado

### Fase 4 - Expansión Regional
- [ ] Multitenancy
- [ ] Plantillas para otras intendencias

---

**Última actualización**: Noviembre 2025  
**Versión del documento**: 1.0
