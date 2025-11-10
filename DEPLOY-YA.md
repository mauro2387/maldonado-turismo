# ⚡ DEPLOY ULTRA RÁPIDO - RENDER (100% GRATIS)

## 🎯 3 Pasos - 5 Minutos Total

---

## PASO 1: Subir a GitHub (si no está) - 1 min

```powershell
# En tu carpeta del proyecto
git init
git add .
git commit -m "Ready for deploy"

# Crear repo en GitHub y conectar
git remote add origin https://github.com/TU-USUARIO/maldonado-turismo.git
git push -u origin main
```

**O si ya tienes Git configurado, solo:**
```powershell
git add .
git commit -m "Deploy config"
git push
```

---

## PASO 2: Deploy en Render - 4 minutos

### A. Backend (2 min):

1. **Ve a:** https://render.com
2. **Sign Up** con GitHub (gratis)
3. **New +** → **Web Service**
4. **Connect** tu repositorio
5. **Configuración:**
   ```
   Name: maldonado-backend
   Region: Oregon (US West)
   Branch: main
   Root Directory: apps/backend
   Runtime: Node
   Build Command: npm install && npm run build && npm run seed:run
   Start Command: npm run start:prod
   Instance Type: Free
   ```

6. **Environment Variables** (Add):
   ```
   DATABASE_URL=postgresql://postgres.nqtxdstshxjemvubcizv:Maldonado-turismo.2024@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   NODE_ENV=production
   API_PORT=3000
   JWT_SECRET=maldonado-secret-2024
   ENABLE_SWAGGER=true
   API_PREFIX=api/v1
   ```

7. **Create Web Service** → Espera 2-3 min

**Tu URL backend:** `https://maldonado-backend.onrender.com`

⚠️ **COPIA ESTA URL!**

---

### B. Frontend (1 min):

1. **New +** → **Static Site**
2. **Connect** el mismo repo
3. **Configuración:**
   ```
   Name: maldonado-frontend
   Branch: main
   Root Directory: apps/frontend
   Build Command: npm install && npm run build
   Publish Directory: apps/frontend/dist
   ```

4. **Environment Variables:**
   ```
   VITE_API_URL=https://maldonado-backend.onrender.com/api/v1
   ```
   *(Reemplaza con tu URL del paso anterior)*

5. **Create Static Site**

**Tu URL frontend:** `https://maldonado-frontend.onrender.com`

---

### C. Admin (1 min):

1. **New +** → **Static Site**
2. **Connect** el mismo repo
3. **Configuración:**
   ```
   Name: maldonado-admin
   Branch: main
   Root Directory: apps/admin
   Build Command: npm install && npm run build
   Publish Directory: apps/admin/dist
   ```

4. **Environment Variables:**
   ```
   VITE_API_URL=https://maldonado-backend.onrender.com/api/v1
   ```

5. **Create Static Site**

**Tu URL admin:** `https://maldonado-admin.onrender.com`

---

## ✅ LISTO! URLs Finales:

- 📱 **App Mobile:** https://maldonado-frontend.onrender.com
- 🔧 **Admin:** https://maldonado-admin.onrender.com
- 🔌 **API:** https://maldonado-backend.onrender.com/api/v1
- 📚 **Docs:** https://maldonado-backend.onrender.com/api/docs

---

## ⚠️ Limitaciones del Plan Gratis:

- **Backend se duerme** después de 15 min de inactividad
- Primera request después de dormir toma **30-50 segundos** en despertar
- Suficiente para demo/presentación

**Solución para demo:** Abre el backend 1 minuto antes de presentar.

---

## 🚀 Auto-Deploy:

Cada `git push` → Render reconstruye automáticamente.

---

## 🧪 Probar que Funciona:

1. **API:** https://maldonado-backend.onrender.com/api/v1/events
   → Deberías ver JSON con eventos

2. **Frontend:** https://maldonado-frontend.onrender.com
   → Deberías ver la app funcionando

3. **Admin:** https://maldonado-admin.onrender.com
   → Panel de login

---

## 💡 Si el Backend está "dormido":

Cuando abras la URL por primera vez, verás que carga lento (30 seg).
Es normal en el plan gratis. Después de la primera request, funciona rápido.

**Para la demo:** Abre estas URLs 1 minuto antes:
- https://maldonado-backend.onrender.com/api/v1/events
- https://maldonado-backend.onrender.com/api/v1/places

Esto "despierta" el backend.

---

## 🔥 ALTERNATIVA MÁS RÁPIDA (pero no 100% gratis):

### VERCEL + RAILWAY ($5/mes):

**Railway tiene free tier** con 500 horas/mes (suficiente para demos).

1. **Backend en Railway:** https://railway.app
   - New Project → Deploy from repo
   - Agrega variables de entorno
   - Deploy

2. **Frontend/Admin en Vercel:** https://vercel.com
   - New Project
   - Import repo
   - Configura root directory
   - Deploy

**Ventaja:** El backend NO se duerme, siempre rápido.

---

## 🎯 Mi Recomendación:

**Para presentar HOY/MAÑANA:** Usa Render (gratis, funciona)

**Para dejar en producción:** Migra a Railway ($5) cuando puedas

---

## 📞 Siguiente Paso:

1. ¿Tenés el código en GitHub ya? → Ve a Render
2. ¿No está en GitHub? → Sigue el Paso 1 arriba

**¿Necesitas ayuda con algún paso?**
