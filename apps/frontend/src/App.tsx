import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@components/layout/Layout';

// Destinos principales
import HomePage from '@pages/home/HomePage';
import MoversePage from '@pages/moverse/MoversePage';

/**
 * Las dos pantallas con mapa se cargan aparte.
 *
 * El fondo vectorial arrastra MapLibre, que pesa más que todo el resto de la
 * app junta —213 kB comprimidos, contra 105 kB de la app entera—. Importado
 * derecho lo descargaba cualquiera que abriera la app, aunque nunca tocara un
 * mapa. Así lo paga solo quien lo usa, y en la conexión de un teléfono en la
 * rambla eso es la diferencia entre abrir y esperar.
 */
const MapaPage = lazy(() => import('@pages/mapa/MapaPage'));
const BondisEnVivoPage = lazy(() => import('@pages/moverse/BondisEnVivoPage'));
import QueHacerPage from '@pages/que-hacer/QueHacerPage';
import VosPage from '@pages/vos/VosPage';

// Fichas y herramientas
import EventoDetailPage from '@pages/agenda/EventoDetailPage';
import PlaceDetailPage from '@pages/places/PlaceDetailPage';
import ParadaDetailPage from '@pages/transporte/ParadaDetailPage';
import ParadaQRPage from '@pages/transporte/ParadaQRPage';
import EscanerQRPage from '@pages/transporte/EscanerQRPage';
import PlanificadorPage from '@pages/transporte/PlanificadorPage';
import NoticiasPage from '@pages/noticias/NoticiasPage';
import NoticiaDetailPage from '@pages/noticias/NoticiaDetailPage';
import SearchPage from '@pages/SearchPage';
import NotFoundPage from '@pages/NotFoundPage';

/**
 * Cinco destinos y sus fichas.
 *
 * Las rutas viejas siguen funcionando pero redirigen: los QR de las paradas ya
 * impresos y los enlaces compartidos no se pueden romper. `/transporte` y
 * `/mapa` de transporte ahora son el mismo lugar que Moverse y Mapa.
 */
function App() {
  const { i18n } = useTranslation();

  return (
    <div className="app" lang={i18n.language}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/mapa"
            element={
              <Suspense fallback={<MapaCargando />}>
                <MapaPage />
              </Suspense>
            }
          />
          <Route path="/moverse" element={<MoversePage />} />
          <Route
            path="/moverse/bondis"
            element={
              <Suspense fallback={<MapaCargando />}>
                <BondisEnVivoPage />
              </Suspense>
            }
          />
          <Route path="/que-hacer" element={<QueHacerPage />} />
          <Route path="/vos" element={<VosPage />} />

          {/* Fichas */}
          <Route path="/evento/:id" element={<EventoDetailPage />} />
          <Route path="/place/:id" element={<PlaceDetailPage />} />
          <Route path="/transporte/paradas/:id" element={<ParadaDetailPage />} />
          <Route path="/transporte/paradas/:id/qr" element={<ParadaQRPage />} />

          {/* Herramientas */}
          <Route path="/transporte/planificador" element={<PlanificadorPage />} />
          <Route path="/transporte/escaner" element={<EscanerQRPage />} />
          <Route path="/noticias" element={<NoticiasPage />} />
          <Route path="/noticia/:id" element={<NoticiaDetailPage />} />
          <Route path="/search" element={<SearchPage />} />

          {/* Rutas anteriores: se conservan para no romper QR ni enlaces */}
          <Route path="/transporte" element={<Navigate to="/moverse" replace />} />
          <Route path="/transporte/mapa" element={<Navigate to="/moverse/bondis" replace />} />
          <Route path="/agenda" element={<Navigate to="/que-hacer" replace />} />
          <Route path="/places" element={<Navigate to="/que-hacer?ver=lugares" replace />} />
          <Route path="/parada/:id" element={<ParadaDetailPage />} />
          <Route path="/parada/:id/qr" element={<ParadaQRPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </div>
  );
}

/**
 * Mientras baja el mapa.
 *
 * Ocupa exactamente el alto que va a ocupar el mapa para que la pantalla no
 * pegue un salto cuando termina de cargar.
 */
function MapaCargando() {
  return (
    <div
      className="flex h-[calc(100dvh-4.25rem)] w-full items-center justify-center bg-sand-100 md:h-[calc(100dvh-3.5rem)]"
      role="status"
      aria-live="polite"
    >
      <span className="text-sm font-semibold text-ink-300">Cargando el mapa…</span>
    </div>
  );
}

export default App;
