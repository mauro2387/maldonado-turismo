# 🎬 Guía de Presentación - Maldonado Turismo

## 📱 Funcionalidades a Demostrar

### 1️⃣ **HomePage - Primera Impresión** (30 seg)
**URL:** `/`

**Qué mostrar:**
- ✅ 2 eventos destacados con imágenes
- ✅ 2 lugares destacados  
- ✅ Diseño limpio y profesional
- ✅ Click en cualquier card → va al detalle

**Wow factor:** Todo es dinámico desde base de datos real

---

### 2️⃣ **Mapa Interactivo** (1 min)
**URL:** `/mapa`

**Qué mostrar:**
- ✅ 26 marcadores en total:
  - 18 lugares (🏖️ 🏛️ 🏨 🌳 🍽️)
  - 8 eventos (🎵 ⚽ 🎨 🎭)
- ✅ Checkboxes para filtrar por capa
- ✅ Filtro por categoría (Playas, Museos, etc)
- ✅ Búsqueda por nombre
- ✅ Click en marcador → popup con info
- ✅ Click "Ver detalles" → página completa

**Wow factor:** Emojis por categoría, filtros en tiempo real

**Demo sugerida:**
1. Mostrar todos los marcadores
2. Desactivar "Eventos" → solo quedan lugares
3. Filtrar solo "Playas" → quedan 3
4. Buscar "Casa" → encuentra Casapueblo
5. Click en Casapueblo → ver detalle

---

### 3️⃣ **Agenda de Eventos** (45 seg)
**URL:** `/agenda`

**Qué mostrar:**
- ✅ Lista de 8 eventos con:
  - Imagen
  - Título
  - Fecha (15 Ene - 22 Ago 2026)
  - Categoría con chip de color
  - Ubicación
- ✅ Filtro por categoría (Música, Deportes, Arte, etc)
- ✅ Click → detalle completo del evento

**Wow factor:** Diseño tipo cards de redes sociales

**Demo sugerida:**
1. Scroll para ver variedad
2. Filtrar "Música" → quedan 2
3. Click en Festival de Jazz → ver detalle con mapa

---

### 4️⃣ **Detalle de Evento** (30 seg)
**URL:** `/evento/:id`

**Qué mostrar:**
- ✅ Imagen grande
- ✅ Título y descripción larga
- ✅ Fecha, hora, ubicación
- ✅ Mapa con ubicación exacta
- ✅ Precio y organizador
- ✅ Botón "Registrar interés"

**Wow factor:** Toda la info en una sola vista

---

### 5️⃣ **Lugares Turísticos** (30 seg)
**URL:** `/lugares`

**Qué mostrar:**
- ✅ Grid de 18 lugares con categorías:
  - 🏖️ 3 Playas (Brava, Mansa, Gorriti)
  - 🏛️ 4 Museos (Casapueblo, Ralli, del Mar, MAAM)
  - 🏨 2 Hoteles
  - 🌳 2 Parques
  - 🍽️ 2 Restaurantes
- ✅ Cada card con imagen y descripción corta
- ✅ Filtro por categoría

**Demo sugerida:**
1. Mostrar grid completo
2. Filtrar "Museos" → 4 resultados
3. Click en Casapueblo → ver galería de imágenes

---

### 6️⃣ **Noticias** (20 seg)
**URL:** `/noticias`

**Qué mostrar:**
- ✅ 8 artículos con imagen
- ✅ Fecha de publicación
- ✅ Categoría (Turismo, Cultura, etc)
- ✅ Click → noticia completa

---

### 7️⃣ **Transporte** (30 seg)
**URL:** `/transporte`

**Qué mostrar:**
- ✅ Sistema de rutas de buses
- ✅ Mapa con paradas
- ✅ Planificador de viajes
- ✅ Scanner QR de paradas

**Wow factor:** Integración completa con transporte público

---

### 8️⃣ **Panel Admin** (1 min) 🔧
**URL:** `https://admin-url/`

**Qué mostrar:**
- ✅ Login seguro
- ✅ Dashboard con estadísticas:
  - 18 lugares
  - 8 eventos  
  - 8 noticias
- ✅ Crear nuevo evento:
  1. Llenar formulario
  2. Seleccionar ubicación en mapa interactivo
  3. Upload imagen
  4. Guardar
- ✅ Ver en el frontend inmediatamente

**Wow factor:** Mapa interactivo para seleccionar coordenadas

---

## 🎯 Orden Sugerido de Demo (5 minutos)

### Minuto 1: Primera Impresión
- HomePage → mostrar destacados
- Explicar: "Sistema completo para turismo en Maldonado"

### Minuto 2: Funcionalidad Principal
- Mapa → mostrar 26 ubicaciones
- Filtros en tiempo real
- Click en un lugar → detalle

### Minuto 3: Contenido Rico
- Agenda → 8 eventos
- Lugares → 18 sitios categorizados
- Noticias → actualidad

### Minuto 4: Features Especiales
- Transporte → sistema completo
- Mobile-first → responsive en cualquier dispositivo

### Minuto 5: Administración
- Panel Admin → crear evento
- Mostrar cómo aparece en frontend inmediatamente

---

## 🗣️ Script Sugerido

### Introducción (15 seg):
> "Les presento el sistema de turismo digital para la Intendencia de Maldonado. Es una aplicación móvil completa con panel de administración que permite gestionar eventos, lugares turísticos, noticias y transporte público."

### Demo Homepage (20 seg):
> "En la pantalla principal vemos destacados: eventos próximos y lugares recomendados. Todo el contenido es dinámico desde la base de datos."

### Demo Mapa (45 seg):
> "El mapa interactivo muestra 26 ubicaciones: 18 lugares turísticos y 8 eventos. Cada uno con su emoji según categoría. Puedo filtrar por tipo - acá solo playas, o buscar específicamente Casapueblo. Click en cualquier marcador y veo el detalle completo con galería de fotos."

### Demo Agenda (30 seg):
> "La agenda tiene todos los eventos con fechas reales. Puedo filtrar por categoría - solo música, por ejemplo. Cada evento tiene su ubicación en el mapa, horarios, precios, y botón para registrar interés."

### Demo Admin (45 seg):
> "Desde el panel administrativo, un operador puede crear eventos nuevos. Selecciona la ubicación directamente en el mapa, sube imágenes, completa datos. Y aparece inmediatamente en la app móvil."

### Cierre (15 seg):
> "El sistema está completamente funcional, con base de datos real en Supabase, API REST en NestJS, y frontend en React. Está deployado y listo para usarse en producción."

---

## 💡 Tips para la Presentación

### ✅ DO:
- Tener las URLs abiertas en pestañas antes
- Probar todo 10 minutos antes
- Tener un evento/lugar "favorito" listo para mostrar
- Destacar el mapa interactivo (más visual)
- Mostrar mobile y desktop (responsive)

### ❌ DON'T:
- No recargar páginas innecesariamente
- No mostrar código a menos que pregunten
- No entrar en detalles técnicos salvo que pidan
- No disculparse por las imágenes de Picsum (son placeholders profesionales)

---

## 📊 Datos para Destacar

### Contenido:
- ✅ 18 lugares turísticos georeferenciados
- ✅ 8 eventos con fechas futuras
- ✅ 8 noticias categorizadas
- ✅ Sistema de transporte con rutas

### Funcionalidades:
- ✅ Mapa interactivo con Leaflet
- ✅ Filtros en tiempo real
- ✅ Búsqueda por texto
- ✅ Responsive (mobile + desktop)
- ✅ Panel admin completo CRUD
- ✅ API REST documentada (Swagger)

### Tecnologías:
- ✅ Frontend: React 18 + TypeScript + Vite
- ✅ Backend: NestJS 10 + PostgreSQL
- ✅ Database: Supabase (cloud)
- ✅ Maps: Leaflet + OpenStreetMap
- ✅ Deploy: Vercel + Railway

---

## 🎬 Checklist Pre-Presentación

- [ ] Backend corriendo y respondiendo
- [ ] Frontend carga sin errores
- [ ] Admin panel accesible
- [ ] Base de datos poblada (18+8+8)
- [ ] Mapa muestra todos los marcadores
- [ ] Al menos 1 evento creado desde admin
- [ ] URLs copiadas en un lugar accesible
- [ ] Probado en mobile (DevTools responsive)
- [ ] Internet estable

---

## 🆘 Plan B (Si algo falla)

### Si el backend no responde:
- Mostrar capturas de pantalla
- Explicar la arquitectura
- Abrir Railway dashboard → logs

### Si el frontend tiene error:
- F12 → Console → explicar el error
- "Es un issue de CORS/config fácil de resolver"
- Mostrar localhost funcionando

### Si el mapa no carga:
- Destacar otras funcionalidades
- Explicar: "El mapa usa Leaflet con OpenStreetMap"
- Mostrar que los datos están en la base

---

## 🎯 Mensaje Final

> "Este es un sistema completo, moderno y escalable. Está listo para producción, con todas las funcionalidades clave: gestión de contenido, visualización en mapa, agenda de eventos, y administración centralizada. La arquitectura permite agregar fácilmente más features como notificaciones push, favoritos de usuarios, o integración con redes sociales."

---

## 📸 Screenshots Recomendados (para backup)

Si querés tener screenshots de respaldo:

1. HomePage con destacados
2. Mapa con todos los marcadores
3. Lista de eventos en agenda
4. Detalle de un evento con mapa
5. Admin - crear evento
6. Admin - dashboard

Toma screenshots en ambas vistas: mobile (375px) y desktop (1920px)

---

## ⏱️ Versión Corta (2 minutos)

Si tenés poco tiempo:

1. **HomePage** (15 seg) → contexto
2. **Mapa con filtros** (45 seg) → wow factor
3. **Crear evento en admin** (45 seg) → funcionalidad
4. **Cierre** (15 seg) → tecnologías

---

## ⏱️ Versión Larga (10 minutos)

Si tenés más tiempo:

1. Introducción + contexto (1 min)
2. Tour completo frontend (5 min)
3. Demo admin creando contenido (2 min)
4. Arquitectura y tecnologías (1 min)
5. Q&A (1 min)

---

¡Éxito en la presentación! 🚀
