import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@features': path.resolve(__dirname, './src/features'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@store': path.resolve(__dirname, './src/store'),
      '@services': path.resolve(__dirname, './src/services'),
      '@assets': path.resolve(__dirname, './src/assets'),
    },
  },
  server: {
    port: 5173,
    // Sin esto, si el puerto está ocupado Vite se corre solo al siguiente: la
    // URL de siempre queda muerta y, peor, el nuevo origen no está en
    // API_CORS_ORIGIN y el backend rechaza los pedidos. Es preferible que
    // falle avisando que el puerto está tomado.
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'map-vendor': ['leaflet', 'react-leaflet'],
          // MapLibre va en su propio bloque y no junto a Leaflet: pesa más que
          // todo el resto del mapa sumado y solo hace falta en las dos
          // pantallas que dibujan el fondo vectorial. Metido en 'map-vendor'
          // lo cargaría cualquiera que abra una ficha de parada.
          'basemap-vendor': ['maplibre-gl', '@maplibre/maplibre-gl-leaflet'],
          'i18n-vendor': ['i18next', 'react-i18next'],
        },
      },
    },
  },
});
