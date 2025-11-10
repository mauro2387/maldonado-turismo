# 🚀 Deploy Rápido - 5 Minutos

## PASO 1: Deploy Backend en Railway (2 min)

### A. Ve a Railway:
https://railway.app

### B. Login con GitHub

### C. New Project → Deploy from GitHub repo

### D. Configuración:
```
Root Directory: apps/backend
Build Command: npm install && npm run build
Start Command: npm run start:prod
```

### E. Variables de Entorno (Settings → Variables):
```
DATABASE_URL=postgresql://postgres.nqtxdstshxjemvubcizv:Maldonado-turismo.2024@aws-0-us-east-1.pooler.supabase.com:6543/postgres
NODE_ENV=production
API_PORT=3000
JWT_SECRET=maldonado-turismo-secret-2024
ENABLE_SWAGGER=true
API_PREFIX=api/v1
```

### F. Deploy!
Railway te dará una URL tipo:
`https://maldonado-turismo-production.up.railway.app`

⚠️ **GUARDA ESTA URL - la necesitas para el siguiente paso!**

---

## PASO 2: Deploy Frontend en Vercel (1 min)

### A. Ve a Vercel:
https://vercel.com

### B. Login con GitHub

### C. New Project → Import tu repo

### D. Configuración:
```
Framework Preset: Vite
Root Directory: apps/frontend
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### E. Environment Variables:
```
VITE_API_URL=https://TU-URL-DE-RAILWAY.up.railway.app/api/v1
```
*(Reemplaza con la URL del Paso 1)*

### F. Deploy!

URL final: `https://maldonado-turismo.vercel.app`

---

## PASO 3: Deploy Admin en Vercel (1 min)

### A. En Vercel → New Project

### B. Import el MISMO repo

### C. Configuración:
```
Framework Preset: Vite
Root Directory: apps/admin
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### D. Environment Variables:
```
VITE_API_URL=https://TU-URL-DE-RAILWAY.up.railway.app/api/v1
```

### E. Deploy!

URL final: `https://maldonado-turismo-admin.vercel.app`

---

## PASO 4: Poblar Base de Datos

### En Railway:
1. Ve a tu proyecto backend
2. Click en "Terminal" o usa Railway CLI
3. Ejecuta:
```bash
npm run seed:run
```

O si no funciona, desde tu computadora:
```bash
cd apps/backend
npm run seed:run
```
(El seed se conecta a Supabase directamente)

---

## ✅ URLs Finales

Después del deploy tendrás:

- 📱 **App Mobile:** https://maldonado-turismo.vercel.app
- 🔧 **Admin Panel:** https://maldonado-turismo-admin.vercel.app
- 🔌 **Backend API:** https://tu-proyecto.up.railway.app/api/v1
- 📚 **API Docs:** https://tu-proyecto.up.railway.app/api/docs

---

## 🧪 Probar que Funciona

### 1. Backend:
Abre: `https://tu-proyecto.up.railway.app/api/v1/events`

Deberías ver JSON con los 8 eventos.

### 2. Frontend:
Abre: `https://maldonado-turismo.vercel.app`

Deberías ver:
- ✅ HomePage con eventos y lugares
- ✅ Mapa con marcadores
- ✅ Agenda funcionando

### 3. Admin:
Abre: `https://maldonado-turismo-admin.vercel.app`

- ✅ Puedes registrarte
- ✅ Ver lista de eventos/lugares
- ✅ Editar items

---

## ⚠️ Si Algo Sale Mal

### "Network Error" en frontend:
**Problema:** Backend no responde o CORS bloqueado

**Solución:**
1. Verifica que el backend esté corriendo en Railway
2. Verifica que pusiste la URL correcta en `VITE_API_URL`
3. El backend YA tiene CORS configurado para `*.vercel.app`

### Base de datos vacía:
**Problema:** Seed no ejecutado

**Solución:**
```bash
cd apps/backend
npm run seed:run
```

### Build falla en Vercel:
**Problema:** Dependencias faltantes

**Solución:**
Verifica que cada app tenga su `package.json` con todas las dependencias.

---

## 💡 TIPS

### Auto-Deploy:
Cada vez que hagas `git push`, Vercel y Railway rebuilderán automáticamente.

### Preview URLs:
Vercel crea URLs de preview por cada PR - útil para testing.

### Logs:
- **Railway:** Click en tu proyecto → Logs
- **Vercel:** Click en tu deploy → Function Logs

### Rollback:
Si algo falla, ambas plataformas permiten hacer rollback a versión anterior con 1 click.

---

## 🎯 Orden de Deploy Recomendado:

1. ✅ Backend primero (necesitas la URL)
2. ✅ Frontend segundo (usa URL del backend)
3. ✅ Admin tercero (usa URL del backend)
4. ✅ Seed al final (populate data)

---

## 📞 URLs Útiles

- Railway Dashboard: https://railway.app/dashboard
- Vercel Dashboard: https://vercel.com/dashboard
- Supabase Dashboard: https://supabase.com/dashboard

---

## ⏱️ Tiempo Total: ~5 minutos

- Backend: 2 min
- Frontend: 1 min  
- Admin: 1 min
- Seed: 1 min

¡Listo para presentar! 🎉
