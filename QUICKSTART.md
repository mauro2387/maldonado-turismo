# 🚀 Quick Start - Maldonado Turismo Platform

## Inicio Rápido (5 minutos)

### Prerrequisitos
- ✅ Node.js 22+
- ✅ Docker Desktop
- ✅ Git

### Paso 1: Clonar e Instalar

```powershell
cd Maldonado-turismo-IN
npm install
```

### Paso 2: Configurar Variables de Entorno

```powershell
# Backend
Copy-Item apps\backend\.env.example apps\backend\.env

# Frontend
Copy-Item apps\frontend\.env.example apps\frontend\.env
```

**Nota**: Los valores por defecto funcionan para desarrollo local.

### Paso 3: Iniciar Base de Datos

```powershell
npm run docker:dev
```

Esto iniciará PostgreSQL, MinIO y pgAdmin en contenedores Docker.

**Espera ~20 segundos** para que PostgreSQL esté listo.

### Paso 4: Ejecutar Migraciones

```powershell
npm run db:migrate
```

### Paso 5: Iniciar Aplicaciones

**Terminal 1 - Backend**:
```powershell
cd apps\backend
npm run start:dev
```

**Terminal 2 - Frontend**:
```powershell
cd apps\frontend
npm run dev
```

### Paso 6: Abrir en el Navegador

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3000/api/v1
- **Swagger Docs**: http://localhost:3000/api/docs
- **pgAdmin**: http://localhost:5050 (admin@maldonado.gub.uy / admin123)

---

## Comandos Útiles

```powershell
# Desarrollo
npm run dev                # Inicia frontend y backend
npm run dev:frontend       # Solo frontend
npm run dev:backend        # Solo backend

# Docker
npm run docker:dev         # Servicios de desarrollo
npm run docker:prod        # Producción (build completo)

# Base de datos
npm run db:migrate         # Ejecutar migraciones
npm run db:seed            # Cargar datos de prueba

# Testing
npm run test               # Tests de todas las apps
npm run lint               # Linter

# Build
npm run build              # Build de ambas apps
npm run build:frontend     # Solo frontend
npm run build:backend      # Solo backend
```

---

## Estructura Rápida

```
maldonado-turismo-platform/
├── apps/
│   ├── frontend/          # React + Vite + TailwindCSS
│   └── backend/           # NestJS + TypeORM + PostgreSQL
├── docker/                # Configuraciones Docker
├── docs/                  # Documentación
│   ├── development.md     # Guía de desarrollo completa
│   ├── deployment.md      # Guía de despliegue
│   └── architecture.md    # Arquitectura del sistema
├── docker-compose.dev.yml # Docker para desarrollo
├── docker-compose.yml     # Docker para producción
└── README.md              # Este archivo
```

---

## Acceso por Defecto (Desarrollo)

### Base de Datos (PostgreSQL)
- **Host**: localhost
- **Port**: 5432
- **Database**: maldonado_turismo
- **User**: maldonado_user
- **Password**: dev_password_123

### MinIO (Storage)
- **Console**: http://localhost:9001
- **User**: minioadmin
- **Password**: minioadmin

### pgAdmin
- **URL**: http://localhost:5050
- **Email**: admin@maldonado.gub.uy
- **Password**: admin123

---

## Roles de Usuario (Para Testing)

Los siguientes roles están configurados en el sistema:

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| `admin_sis` | Administrador de Sistema | Acceso total |
| `turismo` | Gestor de Turismo | Lugares turísticos |
| `cultura` | Gestor de Cultura | Eventos culturales |
| `transporte` | Gestor de Transporte | Rutas y paradas |
| `prensa` | Gestor de Prensa | Noticias y comunicados |
| `lectura` | Solo Lectura | Reportes y dashboards |

---

## Problemas Comunes

### ❌ "Cannot connect to PostgreSQL"
**Solución**: Espera 30 segundos después de `docker:dev` para que PostgreSQL inicie completamente.

### ❌ "Port 3000 already in use"
**Solución**: Detén otros procesos en el puerto 3000 o cambia `API_PORT` en `.env`.

### ❌ Errores de TypeScript en el frontend
**Solución**: Ejecuta `npm install` en `apps/frontend`.

### ❌ "Migration already exists"
**Solución**: Esto es normal si ya ejecutaste las migraciones. Usa `npm run db:migrate` solo una vez.

---

## Próximos Pasos

1. **Leer documentación completa**: `docs/development.md`
2. **Explorar el API**: http://localhost:3000/api/docs
3. **Crear primer usuario**: Ver `docs/development.md#backend`
4. **Agregar datos de prueba**: Ver seeds en `apps/backend/src/db/seeds/`

---

## Recursos

- 📚 [Documentación de Desarrollo](docs/development.md)
- 🚀 [Guía de Despliegue](docs/deployment.md)
- 🏗️ [Arquitectura del Sistema](docs/architecture.md)
- 📝 [Blueprint Técnico](BLUEPRINT.md)

---

## Soporte

**Departamento de Informática - Intendencia de Maldonado**

- 📧 Email: informatica@maldonado.gub.uy
- 🌐 Web: https://maldonado.gub.uy

---

¡Listo para desarrollar! 🎉
