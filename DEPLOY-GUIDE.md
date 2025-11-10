# 🚀 Guía de Deploy Rápido - Maldonado Turismo

## 📦 **OPCIÓN RECOMENDADA: Vercel + Railway (5 minutos)**

### **1️⃣ Deploy Backend en Railway** (2 minutos)

#### A. Crear cuenta en Railway:
1. Ve a https://railway.app
2. Login con GitHub
3. Click "New Project"
4. Selecciona "Deploy from GitHub repo"
5. Conecta tu repo (o sube el proyecto)

#### B. Configurar Backend:
```bash
# Railway detecta automáticamente Node.js
# Solo necesitas configurar:

Root Directory: apps/backend
Build Command: npm install && npm run build
Start Command: npm run start:prod
```

#### C. Variables de entorno en Railway:
```env
DATABASE_URL=postgresql://postgres.nqtxdstshxjemvubcizv:Maldonado-turismo.2024@aws-0-us-east-1.pooler.supabase.com:6543/postgres
NODE_ENV=production
API_PORT=3000
JWT_SECRET=tu-secret-key-aqui-cambiar
```

#### D. Obtener URL del backend:
Railway te da una URL tipo: `https://maldonado-turismo-backend.up.railway.app`

**💾 GUARDA ESTA URL - La necesitarás para el frontend**

---

### **2️⃣ Deploy Frontend en Vercel** (2 minutos)

#### A. Crear cuenta en Vercel:
1. Ve a https://vercel.com
2. Login con GitHub
3. Click "Add New" → "Project"
4. Import tu repo de GitHub

#### B. Configurar Frontend:
```bash
Framework Preset: Vite
Root Directory: apps/frontend
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

#### C. Variables de entorno en Vercel:
```env
VITE_API_URL=https://maldonado-turismo-backend.up.railway.app/api/v1
```
*(Reemplaza con tu URL de Railway del paso 1)*

#### D. Deploy:
Click "Deploy" - Vercel construye y publica automáticamente

**🌐 URL Frontend:** `https://maldonado-turismo.vercel.app`

---

### **3️⃣ Deploy Admin en Vercel** (1 minuto)

#### A. Nuevo proyecto en Vercel:
1. Click "Add New" → "Project"
2. Import el mismo repo

#### B. Configurar Admin:
```bash
Framework Preset: Vite
Root Directory: apps/admin
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

#### C. Variables de entorno en Vercel:
```env
VITE_API_URL=https://maldonado-turismo-backend.up.railway.app/api/v1
```

**🔧 URL Admin:** `https://maldonado-turismo-admin.vercel.app`

---

## 🎯 **ALTERNATIVA: Google Cloud Run** (10 minutos)

### Backend en Cloud Run:

```bash
# 1. Instalar Google Cloud CLI
# https://cloud.google.com/sdk/docs/install

# 2. Login
gcloud auth login
gcloud config set project TU-PROJECT-ID

# 3. Crear Dockerfile para backend
cd apps/backend

# 4. Deploy
gcloud run deploy maldonado-backend \
  --source . \
  --platform managed \
  --region us-east1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="tu-connection-string"
```

### Frontend/Admin en Firebase Hosting:

```bash
# 1. Instalar Firebase CLI
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Inicializar
firebase init hosting

# 4. Build
cd apps/frontend
npm run build

# 5. Deploy
firebase deploy --only hosting
```

---

## ⚡ **OPCIÓN MÁS RÁPIDA: Render** (3 minutos para todo)

### Render.com tiene plan gratuito y es súper simple:

1. **Ve a https://render.com**
2. **Login con GitHub**
3. **New Web Service** → Selecciona tu repo
4. **Configuración Backend:**
   - Name: maldonado-backend
   - Root Directory: apps/backend
   - Build: `npm install && npm run build`
   - Start: `npm run start:prod`
   - Add environment variables

5. **New Static Site** (para frontend):
   - Name: maldonado-frontend
   - Root Directory: apps/frontend
   - Build: `npm install && npm run build`
   - Publish: dist

6. **New Static Site** (para admin):
   - Name: maldonado-admin
   - Root Directory: apps/admin
   - Build: `npm install && npm run build`
   - Publish: dist

---

## 🔧 **Actualizar URLs después del deploy**

### Frontend (apps/frontend/src/config/api.ts):
```typescript
export const API_URL = import.meta.env.VITE_API_URL || 
  'https://maldonado-turismo-backend.up.railway.app/api/v1';
```

### Admin (apps/admin/src/config/api.ts):
```typescript
export const API_URL = import.meta.env.VITE_API_URL || 
  'https://maldonado-turismo-backend.up.railway.app/api/v1';
```

---

## 📊 **Resumen de Costos**

| Servicio | Backend | Frontend | Admin | Total/mes |
|----------|---------|----------|-------|-----------|
| **Vercel + Railway** | $5 | Gratis | Gratis | **$5** |
| **Render** | Gratis* | Gratis | Gratis | **$0** |
| **Google Cloud** | ~$10 | Gratis | Gratis | **~$10** |

*Render free tier: el backend se duerme después de inactividad (demora 30seg en despertar)

---

## ✅ **Checklist Post-Deploy**

- [ ] Backend responde en: `https://tu-backend.com/api/v1/health`
- [ ] Frontend carga: `https://tu-frontend.com`
- [ ] Admin carga: `https://tu-admin.com`
- [ ] Mapa muestra 18 lugares + 8 eventos
- [ ] Login en admin funciona
- [ ] CORS configurado en backend para tus dominios
- [ ] Variables de entorno configuradas

---

## 🆘 **Solución de Problemas**

### Error: "Network Error" en frontend
**Causa:** Backend no está corriendo o CORS bloqueado
**Solución:** 
```typescript
// apps/backend/src/main.ts
app.enableCors({
  origin: [
    'https://maldonado-turismo.vercel.app',
    'https://maldonado-turismo-admin.vercel.app',
    'http://localhost:5173',
    'http://localhost:3001'
  ],
  credentials: true,
});
```

### Error: "Cannot find module"
**Causa:** Dependencias no instaladas
**Solución:** Verifica que `package.json` incluya todas las deps

### Base de datos vacía
**Causa:** Seed no ejecutado
**Solución:** Ejecuta seed manualmente:
```bash
# En Railway/Render, agrega en Build Command:
npm install && npm run build && npm run seed:run
```

---

## 🎬 **Para la Presentación**

URLs finales a compartir:
- 📱 **App Mobile:** https://maldonado-turismo.vercel.app
- 🔧 **Panel Admin:** https://maldonado-turismo-admin.vercel.app
- 🔌 **API:** https://maldonado-turismo-backend.up.railway.app/api/v1

---

## 🚀 **Comandos Rápidos**

```bash
# Deploy Frontend a Vercel (desde raíz del proyecto)
cd apps/frontend
vercel

# Deploy Admin a Vercel
cd apps/admin
vercel

# Deploy Backend a Railway (push a GitHub y conecta)
git add .
git commit -m "Ready for production"
git push origin main
```

---

## 🎯 **Mi Recomendación**

**Para demostrar HOY:** Usa **Vercel + Railway**
- ✅ Más rápido (5 min total)
- ✅ Gratis/muy barato
- ✅ URLs automáticas con SSL
- ✅ Auto-deploy en cada push
- ✅ No requiere conocimientos de DevOps

**Para producción futura:** Migra a Google Cloud Run cuando tengas más tiempo
