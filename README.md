# Plataforma Digital "Agenda + Transporte"
## Intendencia de Maldonado

Plataforma municipal unificada que centraliza turismo, cultura, transporte y comunicación institucional, con mapa interactivo por capas, agenda en tiempo real y sistema Maldonado Bus.

## 🏗️ Arquitectura

**Monorepo** con aplicaciones separadas:
- **Frontend**: React + Vite + TailwindCSS (Mobile-first) - Aplicación pública
- **Backend**: NestJS + PostgreSQL + PostGIS - API REST
- **Backoffice**: Aplicación separada para administración (a desarrollar)

### Stack Tecnológico

- **Frontend**: React 18, Vite, TailwindCSS, Leaflet, i18next, Zustand
- **Backend**: NestJS, TypeORM, PostgreSQL 15+, PostGIS
- **Infraestructura**: Docker, Nginx, MinIO (storage)
- **Testing**: Vitest, Jest, Cypress
- **CI/CD**: GitHub Actions (configurable)

## 📁 Estructura del Proyecto

```
maldonado-turismo-platform/
├── apps/
│   ├── frontend/          # React SPA
│   └── backend/           # NestJS API
├── docker/                # Configuraciones Docker
├── docs/                  # Documentación técnica
└── scripts/               # Scripts de utilidad
```

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 22+ LTS
- Docker Desktop (Windows)
- PostgreSQL 15+ (o usar Docker)
- npm 10+

### Instalación

1. **Clonar e instalar dependencias**:
```powershell
cd Maldonado-turismo-IN
npm install
```

2. **Configurar variables de entorno**:
```powershell
# Backend
cp apps/backend/.env.example apps/backend/.env

# Frontend
cp apps/frontend/.env.example apps/frontend/.env
```

3. **Iniciar base de datos (Docker)**:
```powershell
npm run docker:dev
```

4. **Ejecutar migraciones**:
```powershell
npm run db:migrate
npm run db:seed
```

5. **Iniciar aplicaciones en desarrollo**:
```powershell
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Swagger Docs: http://localhost:3000/api/docs

## 📋 Scripts Disponibles

```powershell
# Desarrollo
npm run dev                 # Inicia frontend y backend
npm run dev:frontend        # Solo frontend
npm run dev:backend         # Solo backend

# Build
npm run build               # Build de ambas apps
npm run build:frontend      # Build frontend
npm run build:backend       # Build backend

# Base de datos
npm run db:migrate          # Ejecutar migraciones
npm run db:seed             # Cargar datos iniciales

# Docker
npm run docker:dev          # Docker compose desarrollo
npm run docker:prod         # Docker compose producción

# Testing
npm run test                # Tests de todas las apps
npm run lint                # Linter en todas las apps
```

## 🗄️ Base de Datos

### Modelo de Datos Principal

- **Lugares**: `places`, `categories`, `tags`
- **Eventos**: `events`
- **Transporte**: `bus_routes`, `bus_stops`, `transport_alerts`
- **Comunicaciones**: `news`
- **QR & Tracking**: `qr_codes`, `qr_scans` (pendiente)
- **Comercios** (Fase 3): `merchants`, `benefits` (pendiente)

### Extensiones PostgreSQL Requeridas

- PostGIS (queries espaciales)
- uuid-ossp (IDs únicos)
- pg_trgm (búsquedas full-text)

## � Seguridad

**Nota importante**: La aplicación pública NO tiene autenticación. Todo el contenido es de acceso público.

El panel de administración (backoffice) será una aplicación completamente separada con:
- Sistema de autenticación independiente
- Infraestructura separada para mayor seguridad
- Roles y permisos por departamento (turismo, cultura, transporte, prensa)
- Auditoría de cambios

Seguridad de la API pública:
- Rate limiting (100 req/min por IP)
- CORS configurado
- Input sanitization
- TLS/SSL obligatorio en producción

---

**Estado Actual del Proyecto**:
- ✅ **Fase 1 (MVP) COMPLETADA**: Frontend público funcional con todas las páginas
- ✅ **API REST**: 12 endpoints funcionando con datos reales de Maldonado
- ✅ **Base de datos**: Supabase PostgreSQL con PostGIS configurado
- ✅ **Datos reales**: 8 lugares, 8 eventos, 8 noticias, 5 rutas de bus, 8 paradas
- ⚠️ **Fase 2 (Backoffice)**: Pendiente desarrollo como aplicación separada
- 📦 **Deployment**: Docker configurado, pendiente despliegue en producción

## 🗺️ Funcionalidades Principales

### Fase 1 - MVP (COMPLETADO)
✅ Mapa interactivo por capas (Turismo, Cultura, Transporte)  
✅ Agenda de eventos en tiempo real  
✅ Noticias institucionales  
✅ Información de Maldonado Bus (horarios, paradas, alertas)  
✅ QR dinámicos por parada/evento (base de datos lista)  
✅ Bilingüe ES/EN  
✅ Backend API REST funcional
✅ Base de datos Supabase con datos reales

### Fase 2 - Backoffice Administrativo (PENDIENTE)
- Aplicación separada para gestión de contenido
- Sistema de autenticación independiente
- CRUD de lugares, eventos, noticias, transporte
- Panel de usuarios y roles por departamento
- Gestión de alertas de transporte
- Generación y tracking de códigos QR
- Upload de imágenes y multimedia

### Fase 3 - Mejoras y Expansión
- GTFS completo para transporte en tiempo real
- PostGIS para queries espaciales avanzadas
- Integración con sistemas externos (Verlyx)
- Módulo de comercios y beneficios
- Analytics y métricas
- SEO optimizado

## 🎨 Frontend - Mobile First

### Diseño Responsive

- **Mobile**: 360-430px (prioridad)
- **Tablet**: 768-1024px
- **Desktop**: 1280px+

### Páginas Principales

- `/` - Home con tarjetas de acceso rápido
- `/mapa` - Mapa interactivo con capas
- `/places` - Listado de lugares turísticos
- `/place/:id` - Detalle de lugar
- `/agenda` - Calendario de eventos
- `/evento/:id` - Detalle de evento
- `/transporte` - Paradas y líneas de bus
- `/parada/:id` - Detalle de parada con horarios
- `/noticias` - Comunicados de prensa
- `/noticia/:id` - Detalle de noticia
- `/search` - Búsqueda general

### Componentes UI

TailwindCSS + Headless UI para accesibilidad (WCAG 2.1 AA).

## 🔌 API REST

### Base URL
- Dev: `http://localhost:3000/api/v1`
- Prod: `https://api.maldonado.gub.uy/api/v1`

### Endpoints Principales

**API Pública** (sin autenticación - todos los endpoints):
- `GET /api/v1/places` - Listado de lugares
- `GET /api/v1/places/:id` - Detalle de lugar
- `GET /api/v1/events` - Agenda de eventos
- `GET /api/v1/events/:id` - Detalle de evento
- `GET /api/v1/transport/routes` - Rutas de bus
- `GET /api/v1/transport/stops` - Paradas de bus
- `GET /api/v1/transport/alerts` - Alertas de transporte
- `GET /api/v1/news` - Noticias
- `GET /api/v1/news/featured` - Noticias destacadas
- `GET /api/v1/news/:id` - Detalle de noticia
- `POST /api/v1/news/:id/view` - Incrementar vistas
- `GET /api/v1/qr/:code` - Redirección QR (pendiente)

**Backoffice API** (aplicación separada - pendiente desarrollo)

Ver documentación completa en `/api/docs` (Swagger).

## 🐳 Docker

### Desarrollo

```powershell
docker-compose -f docker-compose.dev.yml up
```

Servicios:
- PostgreSQL 15 (puerto 5432)
- MinIO (puerto 9000/9001)
- pgAdmin (puerto 5050)

### Producción

```powershell
docker-compose up -d
```

Servicios:
- Frontend (Nginx)
- Backend (NestJS)
- PostgreSQL
- MinIO
- Nginx Proxy

## 🧪 Testing

```powershell
# Unit tests
npm run test

# E2E tests (Cypress)
cd apps/frontend
npm run test:e2e

# Coverage
npm run test:coverage
```

## 📊 Monitoreo y Logs

- Logs de aplicación: `logs/` (por fecha)
- Métricas: tabla `metrics_daily`
- Event log: tabla `event_log` (auditoría)
- Opcional: Prometheus + Grafana (on-prem)

## 🔒 Seguridad

- JWT con rotación de claves cada 90 días
- RBAC estricto por endpoint
- RLS en PostgreSQL
- Rate limiting (100 req/min por IP)
- CSP, CORS configurado
- XSS sanitization (DOMPurify)
- TLS/SSL obligatorio en producción
- Backups diarios automáticos

## 📖 Documentación Adicional

- [Guía de Desarrollo](docs/development.md)
- [Modelo de Datos (ERD)](docs/database-schema.md)
- [API Reference](docs/api-reference.md)
- [Guía de Despliegue](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md)

## 🤝 Contribución

1. Fork del proyecto
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit con conventional commits (`feat:`, `fix:`, `docs:`, etc.)
4. Push a la rama
5. Crear Pull Request

### Conventional Commits

```
feat: nueva funcionalidad
fix: corrección de bug
docs: cambios en documentación
style: formato, punto y coma faltantes
refactor: refactorización de código
test: agregar tests
chore: tareas de mantenimiento
```

## 📝 Licencia

Propiedad de la Intendencia de Maldonado. Todos los derechos reservados.

## 👥 Equipo

**Dirección Técnica**: Departamento de Informática - IM Maldonado  
**Contacto**: informatica@maldonado.gub.uy

## 🔗 Enlaces

- [Intendencia de Maldonado](https://www.maldonado.gub.uy)
- [Verlyx Systems](https://verlyx.com) (Fase 3)

---

**Versión**: 1.0.0 - Fase 1 MVP  
**Última actualización**: Noviembre 2025
