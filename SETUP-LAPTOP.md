# 🚀 Configuración en Nueva Laptop - Maldonado Turismo

## 📋 Requisitos Previos
- Node.js v18 o superior
- npm v9 o superior
- Git (opcional)

## 🔧 Pasos de Instalación

### 1️⃣ Copiar Proyecto
Copia toda la carpeta `Maldonado-turismo-IN` a la nueva laptop.

### 2️⃣ Instalar Dependencias
Abre PowerShell o CMD en la carpeta del proyecto y ejecuta:

```powershell
# Instalar backend
cd apps\backend
npm install

# Instalar frontend  
cd ..\frontend
npm install

# Instalar admin (opcional)
cd ..\admin
npm install

# Volver a raíz
cd ..\..
```

### 3️⃣ Verificar Configuración

**Archivo importante:** `apps\backend\.env`

Este archivo YA contiene la conexión a la base de datos Supabase. NO necesitas modificarlo.

### 4️⃣ Poblar Base de Datos (IMPORTANTE)

```powershell
cd apps\backend
npm run seed:run
```

Este comando carga:
- ✅ 18 lugares turísticos (playas, museos, hoteles, restaurantes, parques)
- ✅ 8 eventos con fechas y ubicaciones
- ✅ 8 noticias

### 5️⃣ Iniciar Aplicación

**Necesitas 2 terminales:**

#### Terminal 1 - Backend
```powershell
cd apps\backend
npm run start:dev
```
Espera a ver: `✅ Application is running on: http://localhost:3000`

#### Terminal 2 - Frontend
```powershell
cd apps\frontend
npm run dev
```
Verás: `Local: http://localhost:5173`

### 6️⃣ Probar la Aplicación

1. **Frontend Mobile:** http://localhost:5173
   - Usuario demo: Navega sin login
   
2. **Admin Panel:** http://localhost:3001 (si instalaste admin)
   - Crear cuenta desde el panel

## 📱 Funcionalidades Disponibles

### Frontend (Mobile)
- ✅ **Inicio:** 2 eventos + 2 lugares destacados
- ✅ **Mapa:** 18 lugares + 8 eventos interactivos con filtros
- ✅ **Agenda:** 8 eventos con fechas, categorías e imágenes
- ✅ **Lugares:** 18 ubicaciones categorizadas
- ✅ **Noticias:** 8 artículos con imágenes
- ✅ **Transporte:** Sistema completo de rutas y planificador

### Admin Panel
- ✅ CRUD completo de Eventos
- ✅ CRUD completo de Lugares
- ✅ CRUD completo de Noticias
- ✅ Selector de mapa con coordenadas
- ✅ Upload de imágenes

## 🗺️ Datos Cargados

### Lugares (18 total):
**Playas:**
- Playa Brava (Los Dedos)
- Playa Mansa
- Isla Gorriti

**Museos:**
- Casapueblo
- Museo Ralli
- Museo del Mar
- MAAM - Museo de Arte Americano Maldonado

**Hoteles:**
- Hotel Conrad Casino & Resort
- Enjoy Conrad Hotel

**Parques:**
- Parque El Jagüel
- Parque Mansebo

**Restaurantes:**
- La Huella (José Ignacio)
- Lo de Tere

**Otros:**
- Puerto de Punta del Este
- Faro de José Ignacio
- Plaza Artigas Maldonado
- Laguna del Sauce

### Eventos (8 total):
- 🎵 Festival Internacional de Jazz
- ⚽ Maratón de Punta del Este
- 🎨 Feria de Artesanos
- 🎨 Festival de Cine
- 🎵 Año Nuevo en Punta del Este
- ⚽ Torneo Internacional de Tenis
- 🎭 Carnaval de José Ignacio
- 🍽️ Feria Gastronómica de Maldonado

## ⚠️ Solución de Problemas

### "npm: command not found"
Instala Node.js desde: https://nodejs.org

### Puerto 3000 ocupado
Cambia el puerto en `apps\backend\.env`:
```
API_PORT=3001
```

### Puerto 5173 ocupado
El frontend usará automáticamente el siguiente disponible (5174, 5175, etc.)

### Errores de base de datos
Verifica que el archivo `apps\backend\.env` tenga la línea:
```
DATABASE_URL=postgresql://...
```
(Ya está configurado, no tocar)

### Re-ejecutar seed
Si necesitas resetear los datos:
```powershell
cd apps\backend
npm run seed:run
```

## 🎯 Para la Presentación

### Orden sugerido de demostración:

1. **Mostrar Homepage** (http://localhost:5173)
   - Destacados con imágenes
   - Navegación inferior

2. **Explorar Mapa**
   - Activar/desactivar capas (Lugares, Eventos)
   - Filtrar por categorías (Playas, Museos, etc.)
   - Click en marcadores

3. **Ver Agenda de Eventos**
   - Filtrar por categoría
   - Ver detalles de evento

4. **Noticias**
   - Scroll de artículos
   - Ver noticia completa

5. **Admin Panel** (opcional)
   - Login
   - Crear un nuevo evento con mapa
   - Ver en el frontend

## 📞 Contacto
Si algo no funciona durante la instalación, revisa:
- Versión de Node.js (debe ser v18+)
- Que las carpetas `node_modules` se instalaron correctamente
- Que ambos servicios (backend y frontend) están corriendo

## ✨ Todo listo!
La aplicación está preparada para demostrar un sistema completo de turismo con:
- 26 ubicaciones mapeadas
- Sistema de eventos
- Noticias
- Transporte público
- Panel administrativo
