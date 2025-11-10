# Instalación en Windows - Guía Completa

Esta guía proporciona instrucciones paso a paso para configurar el entorno de desarrollo en Windows.

## 📋 Prerrequisitos

### 1. Node.js (22 LTS o superior)

**Descargar e instalar**:
1. Ir a https://nodejs.org/
2. Descargar la versión "LTS" (Long Term Support)
3. Ejecutar el instalador `.msi`
4. Verificar instalación:

```powershell
node --version
# Debe mostrar: v22.x.x

npm --version
# Debe mostrar: 10.x.x
```

### 2. Git

**Descargar e instalar**:
1. Ir a https://git-scm.com/download/win
2. Descargar "64-bit Git for Windows Setup"
3. Ejecutar instalador con opciones por defecto
4. Verificar:

```powershell
git --version
# Debe mostrar: git version 2.x.x
```

### 3. Docker Desktop

**Descargar e instalar**:
1. Ir a https://www.docker.com/products/docker-desktop/
2. Descargar "Docker Desktop for Windows"
3. Ejecutar instalador
4. **Importante**: Requiere reiniciar Windows
5. Abrir Docker Desktop y esperar a que inicie
6. Verificar:

```powershell
docker --version
# Debe mostrar: Docker version 24.x.x

docker-compose --version
# Debe mostrar: Docker Compose version v2.x.x
```

**Nota**: Docker Desktop requiere:
- Windows 10 64-bit: Pro, Enterprise, o Education (Build 19041+)
- Windows 11 64-bit: Home, Pro, Enterprise, o Education
- WSL 2 habilitado (el instalador lo configura automáticamente)

### 4. Editor de Código (Opcional pero Recomendado)

**VS Code**:
1. Descargar de https://code.visualstudio.com/
2. Instalar con opciones por defecto
3. Extensiones recomendadas:
   - ESLint
   - Prettier
   - Tailwind CSS IntelliSense
   - GitLens
   - Docker

## 🚀 Instalación del Proyecto

### Paso 1: Navegar al directorio del proyecto

```powershell
cd C:\Users\mauro\OneDrive\Desktop\Maldonado-turismo-IN
```

### Paso 2: Instalar dependencias

```powershell
# Instalar dependencias del proyecto raíz
npm install

# Esto puede tomar 2-5 minutos la primera vez
```

**Nota**: Si aparece algún warning sobre vulnerabilidades, es normal en desarrollo. Puedes ejecutar `npm audit fix` si lo deseas.

### Paso 3: Configurar Variables de Entorno

#### Backend

```powershell
# Copiar archivo de ejemplo
Copy-Item apps\backend\.env.example apps\backend\.env

# Abrir y editar (opcional, los valores por defecto funcionan)
notepad apps\backend\.env
```

Valores importantes para desarrollo:
- `DATABASE_HOST=localhost`
- `DATABASE_PASSWORD=dev_password_123`
- `JWT_SECRET=your_jwt_secret_key` (cambiar en producción)

#### Frontend

```powershell
# Copiar archivo de ejemplo
Copy-Item apps\frontend\.env.example apps\frontend\.env

# Abrir y editar (opcional)
notepad apps\frontend\.env
```

Valores importantes:
- `VITE_API_URL=http://localhost:3000/api/v1`

### Paso 4: Iniciar Docker Desktop

1. Abrir Docker Desktop desde el menú Inicio
2. Esperar a que el icono de Docker en la barra de tareas se ponga verde
3. Esto indica que Docker está listo

### Paso 5: Iniciar Servicios de Desarrollo

```powershell
npm run docker:dev
```

Esto iniciará:
- ✅ PostgreSQL en puerto 5432
- ✅ MinIO en puertos 9000/9001
- ✅ pgAdmin en puerto 5050

**Esperar ~30 segundos** para que todos los servicios inicien.

Para verificar que están corriendo:

```powershell
docker ps
# Debe mostrar 3 contenedores: postgres, minio, pgadmin
```

### Paso 6: Ejecutar Migraciones de Base de Datos

```powershell
# Esperar 30 segundos después de docker:dev
Start-Sleep -Seconds 30

# Ejecutar migraciones
npm run db:migrate
```

Si sale correcto, verás algo como:
```
Migration completed successfully
```

### Paso 7: Iniciar las Aplicaciones

Necesitarás **2 terminales PowerShell**:

**Terminal 1 - Backend**:
```powershell
cd apps\backend
npm run start:dev
```

Esperar a ver:
```
🚀 Maldonado Turismo API running on: http://localhost:3000/api/v1
📚 Swagger docs available at: http://localhost:3000/api/docs
```

**Terminal 2 - Frontend** (en una nueva ventana PowerShell):
```powershell
cd apps\frontend
npm run dev
```

Esperar a ver:
```
VITE v5.x.x ready in xxx ms

➜  Local:   http://localhost:5173/
```

### Paso 8: Verificar que Todo Funciona

Abrir en el navegador:
- ✅ **Frontend**: http://localhost:5173
- ✅ **API**: http://localhost:3000/api/v1/health
- ✅ **Swagger**: http://localhost:3000/api/docs
- ✅ **pgAdmin**: http://localhost:5050

## 🔧 Comandos Útiles

### Gestión de Docker

```powershell
# Ver contenedores corriendo
docker ps

# Ver logs de PostgreSQL
docker logs maldonado-postgres

# Ver logs de todos los servicios
docker-compose -f docker-compose.dev.yml logs -f

# Detener todos los servicios
docker-compose -f docker-compose.dev.yml down

# Reiniciar un servicio específico
docker restart maldonado-postgres
```

### Desarrollo

```powershell
# Reiniciar todo desde cero
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up -d
Start-Sleep -Seconds 30
npm run db:migrate

# Limpiar todo (incluyendo datos)
docker-compose -f docker-compose.dev.yml down -v
# Luego repetir pasos de instalación
```

## ❗ Solución de Problemas

### Error: "npm: command not found"

**Causa**: Node.js no instalado o no en PATH.

**Solución**:
1. Reinstalar Node.js
2. Cerrar y reabrir PowerShell
3. Verificar con `node --version`

### Error: "docker: command not found"

**Causa**: Docker Desktop no instalado o no iniciado.

**Solución**:
1. Abrir Docker Desktop
2. Esperar a que el ícono esté verde
3. Cerrar y reabrir PowerShell

### Error: "Cannot connect to PostgreSQL"

**Causa**: PostgreSQL no ha terminado de iniciar.

**Solución**:
1. Esperar 30-60 segundos más
2. Verificar logs: `docker logs maldonado-postgres`
3. Si sigue fallando: `docker restart maldonado-postgres`

### Error: "Port 5432 is already allocated"

**Causa**: Ya tienes PostgreSQL corriendo localmente.

**Soluciones**:
1. **Opción A**: Detener tu PostgreSQL local
2. **Opción B**: Cambiar puerto en `docker-compose.dev.yml`:
   ```yaml
   ports:
     - "5433:5432"  # Cambiar 5432 a 5433
   ```
   Y actualizar `DATABASE_PORT=5433` en `.env`

### Error: "ENOSPC: System limit for number of file watchers reached"

**Causa**: Límite de watchers en WSL2.

**Solución**:
```powershell
# En WSL2 terminal (si aplica)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Error: "npm ERR! peer dep missing"

**Causa**: Dependencias desactualizadas.

**Solución**:
```powershell
# Limpiar cache
npm cache clean --force

# Reinstalar
Remove-Item -Recurse -Force node_modules
npm install
```

### Frontend muestra pantalla en blanco

**Causa**: Error en JavaScript no manejado.

**Solución**:
1. Abrir DevTools (F12) en el navegador
2. Ver errores en Console
3. Verificar que el backend esté corriendo
4. Verificar que `.env` esté configurado

### Backend no inicia

**Causa**: Error en configuración o dependencias.

**Solución**:
```powershell
cd apps\backend

# Reinstalar dependencias
Remove-Item -Recurse -Force node_modules
npm install

# Verificar .env existe
Test-Path .env

# Ver logs detallados
npm run start:dev
```

## 🎯 Próximos Pasos

Una vez todo esté funcionando:

1. **Explorar la aplicación**: http://localhost:5173
2. **Ver la documentación API**: http://localhost:3000/api/docs
3. **Leer la guía de desarrollo**: `docs/development.md`
4. **Explorar el código**:
   - Frontend: `apps/frontend/src/`
   - Backend: `apps/backend/src/`

## 📞 Soporte

Si sigues teniendo problemas:

1. **Revisar logs**:
   ```powershell
   docker-compose -f docker-compose.dev.yml logs
   ```

2. **Contactar al equipo**:
   - Email: informatica@maldonado.gub.uy

3. **Documentación adicional**:
   - [Guía de Desarrollo](docs/development.md)
   - [Arquitectura](docs/architecture.md)

---

¡Listo para desarrollar! 🚀
