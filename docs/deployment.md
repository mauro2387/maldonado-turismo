# Guía de Despliegue - Producción

## Opción A: Despliegue en Cloud (Supabase + Vercel)

### 1. Base de Datos (Supabase)

1. Crear proyecto en [Supabase](https://supabase.com)
2. Ejecutar el schema SQL desde el SQL Editor
3. Configurar Row Level Security (RLS) policies
4. Obtener credenciales de conexión

### 2. Frontend (Vercel)

```powershell
# Instalar Vercel CLI
npm install -g vercel

# Deploy
cd apps\frontend
vercel --prod
```

Configurar variables de entorno en Vercel dashboard:
- `VITE_API_URL`: URL del backend
- `VITE_MAPBOX_TOKEN`: Token de Mapbox

### 3. Backend (Render/Railway/Fly.io)

Elegir plataforma y seguir sus guías de despliegue con Node.js.

Variables de entorno requeridas:
- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`

---

## Opción B: Despliegue On-Premise (Servidores Municipales)

### Prerrequisitos

- Ubuntu Server 22.04 LTS o similar
- Docker y Docker Compose instalados
- Dominio configurado (ej: `maldonado.gub.uy`)
- Certificados SSL (Let's Encrypt recomendado)

### 1. Preparar el Servidor

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Instalar Docker Compose
sudo apt install docker-compose -y

# Crear usuario para la aplicación
sudo adduser maldonado-app
sudo usermod -aG docker maldonado-app
```

### 2. Clonar Repositorio

```bash
su - maldonado-app
git clone https://github.com/maldonado/turismo-platform.git
cd turismo-platform
```

### 3. Configurar Variables de Entorno

```bash
# Copiar archivos de ejemplo
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env

# Editar con valores de producción
nano apps/backend/.env
```

**Backend (.env)**:
```env
NODE_ENV=production
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USER=maldonado_user
DATABASE_PASSWORD=CAMBIAR_PASSWORD_SEGURO
DATABASE_NAME=maldonado_turismo
DATABASE_SSL=false

JWT_SECRET=CAMBIAR_POR_SECRET_ALEATORIO_LARGO
JWT_EXPIRES_IN=24h

API_PORT=3000
API_PREFIX=api/v1
API_CORS_ORIGIN=https://maldonado.gub.uy

STORAGE_ENDPOINT=minio
STORAGE_PORT=9000
STORAGE_ACCESS_KEY=CAMBIAR_ACCESS_KEY
STORAGE_SECRET_KEY=CAMBIAR_SECRET_KEY

ENABLE_SWAGGER=false
ENABLE_VERLYX=false
```

**Frontend (.env)**:
```env
VITE_API_URL=https://maldonado.gub.uy/api/v1
VITE_MAPBOX_TOKEN=TU_TOKEN_MAPBOX
VITE_MAP_CENTER_LAT=-34.9681
VITE_MAP_CENTER_LNG=-54.9512
VITE_ENV=production
```

### 4. Certificados SSL

Usar Certbot para Let's Encrypt:

```bash
sudo apt install certbot -y

# Obtener certificados
sudo certbot certonly --standalone -d maldonado.gub.uy -d www.maldonado.gub.uy

# Copiar certificados al proyecto
sudo cp /etc/letsencrypt/live/maldonado.gub.uy/fullchain.pem docker/nginx/ssl/
sudo cp /etc/letsencrypt/live/maldonado.gub.uy/privkey.pem docker/nginx/ssl/
sudo chown maldonado-app:maldonado-app docker/nginx/ssl/*
```

### 5. Build y Deploy

```bash
# Build de las aplicaciones
docker-compose build

# Iniciar servicios
docker-compose up -d

# Verificar que estén corriendo
docker-compose ps
```

### 6. Ejecutar Migraciones

```bash
# Esperar que PostgreSQL inicie (~30 segundos)
sleep 30

# Ejecutar migraciones
docker-compose exec backend npm run migration:run

# (Opcional) Cargar datos de prueba
docker-compose exec backend npm run seed:run
```

### 7. Verificar Despliegue

```bash
# Ver logs
docker-compose logs -f

# Verificar salud del API
curl https://maldonado.gub.uy/api/v1/health

# Verificar frontend
curl -I https://maldonado.gub.uy
```

### 8. Configurar Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 9. Configurar Backups Automáticos

Crear script de backup:

```bash
nano /home/maldonado-app/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backups/maldonado-turismo"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup de PostgreSQL
docker exec maldonado-postgres pg_dump -U maldonado_user maldonado_turismo | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup de MinIO (archivos subidos)
docker exec maldonado-minio mc mirror /data /backup

# Retener últimos 30 días
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete

echo "Backup completado: $DATE"
```

```bash
chmod +x /home/maldonado-app/backup.sh

# Agregar a crontab (diario a las 2 AM)
crontab -e
# Agregar línea:
0 2 * * * /home/maldonado-app/backup.sh >> /var/log/maldonado-backup.log 2>&1
```

### 10. Monitoreo

Instalar herramientas de monitoreo básicas:

```bash
# Logs centralizados
docker-compose logs -f > /var/log/maldonado-app.log &

# Monitoreo de recursos (opcional - Grafana)
# Ver documentación de Grafana + Prometheus
```

---

## Mantenimiento

### Actualizar la Aplicación

```bash
cd ~/turismo-platform

# Backup antes de actualizar
./backup.sh

# Pull cambios
git pull origin main

# Rebuild y redeploy
docker-compose down
docker-compose build
docker-compose up -d

# Ejecutar migraciones si hay cambios en DB
docker-compose exec backend npm run migration:run
```

### Ver Logs

```bash
# Todos los servicios
docker-compose logs -f

# Solo backend
docker-compose logs -f backend

# Solo frontend
docker-compose logs -f frontend

# Últimas 100 líneas
docker-compose logs --tail=100
```

### Reiniciar Servicios

```bash
# Todos
docker-compose restart

# Individual
docker-compose restart backend
docker-compose restart frontend
```

### Restaurar Backup

```bash
# Detener aplicación
docker-compose down

# Restaurar base de datos
gunzip -c /backups/maldonado-turismo/db_20250101_020000.sql.gz | \
  docker exec -i maldonado-postgres psql -U maldonado_user -d maldonado_turismo

# Iniciar aplicación
docker-compose up -d
```

---

## Checklist de Seguridad

- [ ] Cambiar todas las contraseñas por defecto
- [ ] JWT_SECRET es aleatorio y fuerte (mínimo 32 caracteres)
- [ ] Certificados SSL configurados y válidos
- [ ] Firewall configurado correctamente
- [ ] CORS configurado solo para dominios autorizados
- [ ] Rate limiting activo en Nginx
- [ ] Backups automáticos configurados
- [ ] Usuarios de DB no tienen permisos excesivos
- [ ] Logs rotados automáticamente
- [ ] Swagger deshabilitado en producción
- [ ] Variables de entorno no commiteadas en Git

---

## Troubleshooting Producción

### Servicio no inicia

```bash
# Ver logs detallados
docker-compose logs [servicio]

# Verificar configuración
docker-compose config

# Recrear contenedores
docker-compose down
docker-compose up -d --force-recreate
```

### Alto uso de memoria/CPU

```bash
# Ver estadísticas
docker stats

# Reiniciar servicios uno por uno
docker-compose restart backend
docker-compose restart frontend
```

### Errores de SSL

```bash
# Renovar certificados (Let's Encrypt)
sudo certbot renew

# Copiar nuevos certificados
sudo cp /etc/letsencrypt/live/maldonado.gub.uy/* docker/nginx/ssl/

# Reiniciar Nginx
docker-compose restart nginx
```

---

## Contacto de Soporte

**Departamento de Informática - IM Maldonado**  
Email: informatica@maldonado.gub.uy  
Teléfono: +598 XX XXXX XXXX
