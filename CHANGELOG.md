# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.0.0] - 2025-11-08

### Agregado - Fase 1 MVP

#### Frontend
- ✨ Aplicación React con Vite y TailwindCSS
- 🌍 Sistema de internacionalización (ES/EN) con i18next
- 🗺️ Vista de mapa interactivo con Leaflet
- 📅 Vista de agenda de eventos
- 🚌 Vista de transporte (paradas y líneas)
- 📰 Vista de noticias institucionales
- 🏠 Página home con accesos rápidos
- 📱 Diseño mobile-first responsive
- 🎨 Sistema de componentes reutilizables
- 🔐 Página de login y autenticación básica
- 📊 Dashboard administrativo básico
- 🧭 Navegación por bottom nav (móvil) y header (desktop)

#### Backend
- 🏗️ API REST con NestJS y TypeORM
- 🔒 Sistema de autenticación JWT
- 👥 RBAC (Control de acceso basado en roles)
- 🏛️ Módulo de lugares turísticos
- 🎭 Módulo de eventos y agenda
- 🚍 Módulo de transporte (paradas, rutas, horarios)
- 📢 Módulo de noticias y comunicados
- 📱 Sistema de generación y tracking de QR
- 📈 Sistema básico de auditoría (event_log)
- 📖 Documentación OpenAPI/Swagger
- ✅ Validación de DTOs con class-validator

#### Base de Datos
- 🗄️ Esquema completo PostgreSQL 15 con PostGIS
- 📍 Índices geoespaciales para búsquedas por ubicación
- 👤 Tablas de usuarios, roles y departamentos
- 🏞️ Tablas de lugares con traducciones ES/EN
- 🎪 Tablas de eventos con categorías y tags
- 🚏 Tablas de transporte (GTFS-lite)
- 📝 Tablas de noticias y banners
- 🔍 Tablas de QR codes y tracking de scans
- 📊 Tablas de analítica y métricas

#### Infraestructura
- 🐳 Docker Compose para desarrollo
- 🐳 Docker Compose para producción
- 🌐 Configuración Nginx con SSL y rate limiting
- 📦 MinIO para almacenamiento de archivos
- 🛠️ Scripts de migración y seeds
- 🔧 Configuraciones de ESLint y Prettier
- 📚 Documentación completa en `/docs`

#### Documentación
- 📖 README principal con overview
- 🚀 QUICKSTART con instrucciones de 5 minutos
- 💻 Guía de desarrollo completa
- 🌍 Guía de despliegue (Cloud y On-premise)
- 🏗️ Documento de arquitectura del sistema
- 📄 Blueprint técnico detallado

### Seguridad
- 🔐 Autenticación JWT con refresh tokens
- 🛡️ RBAC con 6 roles configurados
- 🔒 Rate limiting en endpoints API y QR
- 🌐 CORS configurado por entorno
- 🔑 Secrets management con variables de entorno
- 📝 Auditoría de acciones en event_log

### Herramientas de Desarrollo
- 🔧 Hot reload en frontend y backend
- 🧪 Configuración Jest para testing
- 🎯 Configuración Cypress para E2E
- 📊 pgAdmin para gestión de DB
- 🎨 TailwindCSS IntelliSense support
- 📝 TypeScript strict mode

---

## [Próximas Versiones]

### [1.1.0] - Fase 2: Transporte & Seguridad (Planeado Q1 2026)

#### Planeado
- 🚌 GTFS-lite completo (importación masiva)
- ⚠️ Sistema de alertas de transporte en tiempo real
- 🔐 Row Level Security (RLS) en PostgreSQL
- 🌍 Queries espaciales avanzadas con PostGIS
- 💾 Sistema de backups automáticos
- 📊 Mejoras en auditoría y logs
- 🔒 Hardening de seguridad y WAF básico
- 📡 Monitoreo con Prometheus y Grafana (opcional)

### [2.0.0] - Fase 3: Verlyx + Comercios (Planeado Q2 2026)

#### Planeado
- 🤝 Integración con Verlyx Systems
- 🏪 Módulo de comercios y beneficios
- 🎟️ Sistema de canjes con QR
- 📈 Panel de analítica avanzada
- 📊 Dashboards con métricas de uso
- 🔍 SEO optimizado para eventos/lugares
- 🌐 Microdatos schema.org
- 📱 PWA (Progressive Web App)

### [3.0.0] - Fase 4: Expansión Regional (Planeado Q3 2026)

#### Planeado
- 🌎 Sistema multitenancy
- 📋 Plantillas para otras intendencias
- 🔧 Panel de configuración por instancia
- 📦 Sistema de clonación rápida
- 🌐 Portal de administración multi-municipio
- 📊 Analítica comparativa entre municipios

---

## Versionado

Este proyecto usa [Semantic Versioning](https://semver.org/):

- **MAJOR**: Cambios incompatibles en el API
- **MINOR**: Nueva funcionalidad compatible hacia atrás
- **PATCH**: Correcciones de bugs compatibles hacia atrás

## Etiquetas de Cambios

- ✨ `Agregado`: Nueva funcionalidad
- 🔧 `Cambiado`: Cambios en funcionalidad existente
- ⚠️ `Deprecado`: Funcionalidad que será removida
- ❌ `Removido`: Funcionalidad eliminada
- 🐛 `Corregido`: Corrección de bugs
- 🔒 `Seguridad`: Vulnerabilidades arregladas

---

**Mantenido por**: Departamento de Informática - Intendencia de Maldonado  
**Contacto**: informatica@maldonado.gub.uy
