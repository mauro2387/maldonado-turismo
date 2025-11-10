# Backoffice - Hoja de Ruta

## 📋 Contexto

La aplicación pública de Maldonado Turismo está **completa y funcional**. No tiene sistema de autenticación porque todo el contenido es público.

El **backoffice** será una **aplicación completamente separada** por razones de seguridad. Esto garantiza:
- ✅ Separación total entre contenido público y administración
- ✅ Infraestructura independiente con mejores controles de acceso
- ✅ Sin riesgo de exponer endpoints administrativos
- ✅ Posibilidad de hospedar en diferentes servidores/redes

---

## 🎯 Objetivo del Backoffice

Crear una aplicación web administrativa para que los diferentes departamentos de la Intendencia puedan:

1. **Crear, editar y eliminar** lugares turísticos
2. **Gestionar eventos** de la agenda cultural
3. **Publicar noticias** institucionales
4. **Administrar transporte** (rutas, paradas, alertas)
5. **Generar códigos QR** para paradas y eventos
6. **Ver estadísticas** de uso y visitas

---

## 🏗️ Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────┐
│                  APLICACIÓN PÚBLICA                      │
│            (Ya completa y funcional)                     │
│                                                          │
│  Frontend: localhost:5173                               │
│  Backend API: localhost:3000/api/v1                     │
│  Base de datos: Supabase PostgreSQL                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              BACKOFFICE (A desarrollar)                  │
│                                                          │
│  Admin Frontend: localhost:4173 (nuevo)                 │
│  Admin API: localhost:4000/api/admin (nuevo)            │
│  Misma base de datos Supabase                           │
│  Autenticación: JWT + Roles                             │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Stack Tecnológico Sugerido

### Opción 1: React Admin Dashboard (Recomendado)
- **Frontend**: React + Vite + React Admin o Refine
- **Backend**: Extender el NestJS existente con módulo `/api/admin`
- **Auth**: NestJS + Passport + JWT
- **UI Components**: Ant Design, Material UI, o Chakra UI
- **Ventajas**: Reutiliza el backend existente, integración rápida

### Opción 2: Framework Full-Stack
- **Framework**: Next.js 14+ con App Router
- **Auth**: NextAuth.js
- **UI**: shadcn/ui + Tailwind
- **API**: Next.js API Routes o tRPC
- **Ventajas**: Todo en uno, autenticación integrada

### Opción 3: Backend Separado
- **Frontend**: React + Vite
- **Backend**: NestJS independiente en nuevo proyecto
- **Auth**: NestJS + Passport
- **Ventajas**: Máxima separación, deploy independiente

---

## 👥 Sistema de Roles

| Rol | Permisos | Departamento |
|-----|----------|--------------|
| **admin_sis** | Todo | Informática |
| **turismo** | Gestionar lugares, ver estadísticas | Turismo |
| **cultura** | Gestionar eventos, ver estadísticas | Cultura |
| **transporte** | Gestionar rutas, paradas, alertas | Transporte |
| **prensa** | Gestionar noticias, ver estadísticas | Comunicación |
| **lectura** | Solo lectura (estadísticas, reportes) | Múltiple |

---

## 🗃️ Modelo de Datos para Backoffice

### Nueva tabla: `admin_users`
```sql
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    department VARCHAR(100),
    active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Nueva tabla: `audit_log`
```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES admin_users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    changes JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔐 Seguridad del Backoffice

1. **Autenticación**:
   - Email + contraseña
   - JWT con expiración de 8 horas
   - Refresh token de 7 días
   - Logout manual + blacklist de tokens

2. **Autorización**:
   - RBAC por rol (admin_sis, turismo, cultura, etc.)
   - Guards de NestJS en cada endpoint
   - Validación de permisos a nivel de controlador

3. **Auditoría**:
   - Registro de todas las acciones (crear, editar, eliminar)
   - IP del usuario
   - Timestamp de cada operación
   - Cambios guardados en JSONB

4. **Red y Hosting**:
   - **Producción**: Hospedar en red interna de la Intendencia
   - **DNS interno**: admin.maldonado.local (solo accesible desde intranet)
   - **Firewall**: Bloquear acceso desde internet público
   - **VPN**: Acceso remoto solo vía VPN de la Intendencia

---

## 📋 Funcionalidades del Backoffice

### Dashboard Principal
- [x] Estadísticas generales (total lugares, eventos, noticias)
- [x] Últimas publicaciones
- [x] Alertas activas de transporte
- [x] Gráfico de visitas por mes

### Gestión de Lugares
- [x] Listado con filtros (categoría, estado)
- [x] Formulario crear/editar con:
  - Información básica (nombre, descripción, categoría)
  - Ubicación (mapa para seleccionar lat/lng)
  - Imágenes (upload múltiple)
  - Horarios (editor JSON o form estructurado)
  - Contacto (teléfono, email, web, redes)
- [x] Preview antes de publicar
- [x] Eliminar (con confirmación)

### Gestión de Eventos
- [x] Calendario visual
- [x] Formulario crear/editar con:
  - Título, descripción, categoría
  - Fechas (inicio, fin, hora)
  - Ubicación (mapa)
  - Precio, capacidad
  - Imágenes y galería
  - Tags
- [x] Duplicar evento (para eventos recurrentes)
- [x] Publicar/despublicar

### Gestión de Noticias
- [x] Listado con filtros (categoría, fecha, destacadas)
- [x] Editor rich-text para contenido (TinyMCE o Draft.js)
- [x] Imagen destacada + galería
- [x] Marcar como destacada
- [x] Vista de contador de vistas

### Gestión de Transporte
- [x] CRUD de rutas de bus (nombre, color, frecuencia, horarios)
- [x] CRUD de paradas (nombre, ubicación, rutas asociadas)
- [x] Crear alertas (tipo, mensaje, rutas afectadas, fechas)
- [x] Mapa con todas las paradas para edición visual

### Gestión de QR
- [x] Generar QR para:
  - Paradas de bus (código fijo)
  - Eventos (código temporal)
- [x] Ver estadísticas de escaneos por QR
- [x] Descargar QR en alta resolución (PNG, SVG)

### Usuarios y Permisos
- [x] Listado de usuarios admin
- [x] Crear/editar usuarios con email y rol
- [x] Cambiar contraseña
- [x] Activar/desactivar usuarios
- [x] Asignar departamento

### Auditoría
- [x] Listado de acciones realizadas
- [x] Filtros por usuario, fecha, tipo de acción
- [x] Ver detalles de cambios (diff JSON)

---

## 📅 Estimación de Tiempos

| Fase | Descripción | Tiempo Estimado |
|------|-------------|-----------------|
| **Fase 1** | Setup backend admin + auth | 3-4 días |
| **Fase 2** | CRUD Lugares + UI | 4-5 días |
| **Fase 3** | CRUD Eventos + UI | 3-4 días |
| **Fase 4** | CRUD Noticias + UI | 3-4 días |
| **Fase 5** | CRUD Transporte + UI | 4-5 días |
| **Fase 6** | Sistema QR + estadísticas | 3-4 días |
| **Fase 7** | Usuarios, roles y auditoría | 4-5 días |
| **Fase 8** | Testing y ajustes | 3-4 días |
| **Fase 9** | Deploy y documentación | 2-3 días |

**Total estimado**: 29-42 días (6-8 semanas) para un desarrollador full-time.

---

## 🚀 Inicio Rápido del Desarrollo

### 1. Crear estructura del proyecto

```powershell
# Opción 1: Dentro del monorepo existente
cd apps/
mkdir backoffice
cd backoffice
npm create vite@latest . -- --template react-ts

# Opción 2: Proyecto separado
mkdir maldonado-backoffice
cd maldonado-backoffice
npm create vite@latest . -- --template react-ts
```

### 2. Instalar dependencias

```powershell
npm install react-router-dom
npm install @tanstack/react-query axios
npm install react-hook-form zod @hookform/resolvers
npm install lucide-react # iconos
npm install recharts # gráficos
npm install react-leaflet leaflet # mapas

# UI (elegir una):
npm install antd  # Ant Design
# o
npm install @mui/material @emotion/react @emotion/styled
# o
npm install @chakra-ui/react @emotion/react @emotion/styled
```

### 3. Extender backend con módulo admin

```powershell
cd apps/backend/src/modules
nest g module admin
nest g controller admin/auth
nest g service admin/auth
nest g controller admin/places
nest g service admin/places
# ... repetir para eventos, noticias, etc.
```

### 4. Configurar autenticación

```typescript
// apps/backend/src/modules/admin/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
```

---

## 📖 Recursos Útiles

- [React Admin](https://marmelab.com/react-admin/) - Framework para admin panels
- [Refine](https://refine.dev/) - Framework moderno para backoffice
- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [React Hook Form](https://react-hook-form.com/) - Formularios
- [Recharts](https://recharts.org/) - Gráficos para dashboard

---

## ✅ Checklist para Empezar

- [ ] Decidir arquitectura (Opción 1, 2 o 3)
- [ ] Crear tabla `admin_users` en Supabase
- [ ] Crear tabla `audit_log` en Supabase
- [ ] Setup proyecto frontend backoffice
- [ ] Implementar autenticación en backend
- [ ] Crear primer usuario admin (script SQL)
- [ ] Implementar login en frontend
- [ ] Crear layout del dashboard
- [ ] Implementar primer CRUD (lugares)

---

**Última actualización**: Noviembre 2025  
**Estado**: Pendiente inicio de desarrollo
