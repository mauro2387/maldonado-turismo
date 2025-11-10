# Guía de Desarrollo - Plataforma Maldonado Turismo

## Configuración Inicial

### Prerrequisitos

- Node.js 22+ LTS
- Docker Desktop (para desarrollo)
- Git
- VS Code (recomendado)

### Instalación

1. **Clonar el repositorio e instalar dependencias**:

```powershell
cd Maldonado-turismo-IN
npm install
```

2. **Configurar variables de entorno**:

```powershell
# Backend
Copy-Item apps\backend\.env.example apps\backend\.env

# Frontend  
Copy-Item apps\frontend\.env.example apps\frontend\.env
```

Edita los archivos `.env` con las credenciales apropiadas.

3. **Iniciar servicios de desarrollo (Docker)**:

```powershell
npm run docker:dev
```

Esto iniciará:
- PostgreSQL con PostGIS (puerto 5432)
- MinIO (puertos 9000/9001)
- pgAdmin (puerto 5050)

4. **Esperar a que PostgreSQL esté listo** y ejecutar migraciones:

```powershell
# Esperar ~10 segundos para que PostgreSQL inicie
npm run db:migrate
```

5. **Iniciar aplicaciones**:

```powershell
# Terminal 1: Backend
cd apps\backend
npm run start:dev

# Terminal 2: Frontend
cd apps\frontend
npm run dev
```

## Estructura del Proyecto

```
maldonado-turismo-platform/
├── apps/
│   ├── frontend/          # React SPA
│   │   ├── src/
│   │   │   ├── components/  # Componentes reutilizables
│   │   │   ├── features/    # Features por módulo
│   │   │   ├── pages/       # Páginas/rutas
│   │   │   ├── lib/         # Utilidades (api-client, i18n)
│   │   │   ├── store/       # Zustand stores
│   │   │   └── styles/      # Estilos globales
│   │   └── public/          # Assets estáticos
│   │
│   └── backend/           # NestJS API
│       ├── src/
│       │   ├── modules/     # Módulos por dominio
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── lugares/
│       │   │   ├── agenda/
│       │   │   ├── transporte/
│       │   │   ├── comunicaciones/
│       │   │   └── qr/
│       │   ├── common/      # Guards, filters, interceptors
│       │   └── db/          # Migrations, seeds
│       └── test/            # Tests E2E
│
├── docker/                # Configuraciones Docker
│   ├── backend/
│   ├── frontend/
│   └── nginx/
│
├── docs/                  # Documentación
└── scripts/              # Scripts de utilidad
```

## Flujo de Desarrollo

### Frontend

#### Crear un nuevo componente:

```tsx
// apps/frontend/src/components/ui/Button.tsx
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
}

export function Button({ children, variant = 'primary', onClick }: ButtonProps) {
  const className = variant === 'primary' ? 'btn btn-primary' : 'btn btn-secondary';
  
  return (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  );
}
```

#### Crear una nueva página:

```tsx
// apps/frontend/src/pages/example/ExamplePage.tsx
import { useTranslation } from 'react-i18next';

export default function ExamplePage() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold">{t('example.title')}</h1>
    </div>
  );
}
```

Agregar ruta en `App.tsx`:

```tsx
<Route path="/example" element={<ExamplePage />} />
```

#### Agregar traducciones:

```ts
// apps/frontend/src/lib/i18n.ts
const resources = {
  es: {
    translation: {
      'example.title': 'Título de Ejemplo',
    },
  },
  en: {
    translation: {
      'example.title': 'Example Title',
    },
  },
};
```

### Backend

#### Crear un nuevo módulo:

```powershell
cd apps\backend
nest generate module modules/ejemplo
nest generate controller modules/ejemplo
nest generate service modules/ejemplo
```

#### Crear una entidad:

```ts
// apps/backend/src/modules/ejemplo/entities/ejemplo.entity.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ejemplos')
export class Ejemplo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nombre: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
```

#### Crear un DTO:

```ts
// apps/backend/src/modules/ejemplo/dto/create-ejemplo.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEjemploDto {
  @ApiProperty({ description: 'Nombre del ejemplo' })
  @IsString()
  @IsNotEmpty()
  nombre: string;
}
```

#### Crear un controller endpoint:

```ts
// apps/backend/src/modules/ejemplo/ejemplo.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EjemploService } from './ejemplo.service';
import { CreateEjemploDto } from './dto/create-ejemplo.dto';

@ApiTags('ejemplo')
@Controller('ejemplo')
export class EjemploController {
  constructor(private readonly ejemploService: EjemploService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los ejemplos' })
  findAll() {
    return this.ejemploService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un ejemplo' })
  create(@Body() createDto: CreateEjemploDto) {
    return this.ejemploService.create(createDto);
  }
}
```

## Testing

### Frontend

```powershell
cd apps\frontend

# Unit tests
npm run test

# E2E tests
npm run test:e2e
```

### Backend

```powershell
cd apps\backend

# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## Base de Datos

### Crear una nueva migración:

```powershell
cd apps\backend
npm run migration:generate -- -n NombreDeLaMigracion
```

### Ejecutar migraciones:

```powershell
npm run migration:run
```

### Revertir última migración:

```powershell
npm run migration:revert
```

### Acceder a pgAdmin:

1. Abrir http://localhost:5050
2. Email: `admin@maldonado.gub.uy`
3. Password: `admin123`
4. Agregar servidor:
   - Host: `postgres`
   - Port: `5432`
   - Database: `maldonado_turismo`
   - Username: `maldonado_user`
   - Password: `dev_password_123`

## Buenas Prácticas

### Commits

Usar conventional commits:

```
feat: agregar endpoint de lugares turísticos
fix: corregir error en validación de eventos
docs: actualizar README con instrucciones
style: formatear código con prettier
refactor: reorganizar estructura de carpetas
test: agregar tests para módulo de transporte
chore: actualizar dependencias
```

### Naming Conventions

- **Archivos**: kebab-case (`user-profile.tsx`)
- **Componentes React**: PascalCase (`UserProfile`)
- **Funciones/variables**: camelCase (`getUserProfile`)
- **Constantes**: UPPER_SNAKE_CASE (`API_URL`)
- **Interfaces TypeScript**: PascalCase con prefijo `I` opcional (`IUserProfile` o `UserProfile`)

### CSS/Tailwind

Preferir utility classes de Tailwind. Para estilos reutilizables, usar `@apply`:

```css
.custom-card {
  @apply rounded-xl bg-white p-4 shadow-sm border border-gray-200;
}
```

### Mobile-First

Siempre diseñar primero para móvil:

```tsx
<div className="flex flex-col md:flex-row">
  {/* Mobile: columna, Desktop: fila */}
</div>

<div className="text-sm md:text-base">
  {/* Mobile: texto pequeño, Desktop: texto normal */}
</div>
```

## Troubleshooting

### El frontend no puede conectarse al backend

Verificar que el backend esté corriendo y que la variable `VITE_API_URL` esté configurada correctamente.

### Error de conexión a PostgreSQL

1. Verificar que Docker Desktop esté corriendo
2. Verificar logs: `docker logs maldonado-postgres`
3. Reiniciar contenedor: `docker restart maldonado-postgres`

### Errores de TypeScript en el frontend

Los errores son esperados hasta instalar dependencias:

```powershell
cd apps\frontend
npm install
```

### Hot reload no funciona

Reiniciar el servidor de desarrollo:

```powershell
# Ctrl+C para detener
npm run dev
```

## Recursos

- [React Documentation](https://react.dev/)
- [NestJS Documentation](https://docs.nestjs.com/)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)
- [TypeORM Documentation](https://typeorm.io/)
- [PostgreSQL + PostGIS](https://postgis.net/)
- [Leaflet Maps](https://leafletjs.com/)

## Contacto

Para dudas técnicas, contactar al equipo de Informática:
- Email: informatica@maldonado.gub.uy
