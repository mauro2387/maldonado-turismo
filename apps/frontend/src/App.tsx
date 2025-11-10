import { Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@components/layout/Layout';

// Pages
import HomePage from '@pages/home/HomePage';
import MapaPage from '@pages/mapa/MapaPage';
import AgendaPage from '@pages/agenda/AgendaPage';
import EventoDetailPage from '@pages/agenda/EventoDetailPage';
import TransportePage from '@pages/transporte/TransportePage';
import ParadaDetailPage from '@pages/transporte/ParadaDetailPage';
import MapaTransporteLivePage from '@pages/transporte/MapaTransporteLivePage';
import EscanerQRPage from '@pages/transporte/EscanerQRPage';
import ParadaQRPage from '@pages/transporte/ParadaQRPage';
import PlanificadorPage from '@pages/transporte/PlanificadorPage';
import NoticiasPage from '@pages/noticias/NoticiasPage';
import NoticiaDetailPage from '@pages/noticias/NoticiaDetailPage';
import PlacesPage from '@pages/places/PlacesPage';
import PlaceDetailPage from '@pages/places/PlaceDetailPage';
import SearchPage from '@pages/SearchPage';
import NotFoundPage from '@pages/NotFoundPage';

function App() {
  const { i18n } = useTranslation();

  return (
    <div className="app" lang={i18n.language}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/mapa" element={<MapaPage />} />
          
          <Route path="/places" element={<PlacesPage />} />
          <Route path="/place/:id" element={<PlaceDetailPage />} />
          
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/evento/:id" element={<EventoDetailPage />} />
          
          <Route path="/transporte" element={<TransportePage />} />
          <Route path="/transporte/mapa" element={<MapaTransporteLivePage />} />
          <Route path="/transporte/escaner" element={<EscanerQRPage />} />
          <Route path="/transporte/planificador" element={<PlanificadorPage />} />
          <Route path="/transporte/paradas/:id" element={<ParadaDetailPage />} />
          <Route path="/transporte/paradas/:id/qr" element={<ParadaQRPage />} />
          
          {/* Legacy routes - redirect to new structure */}
          <Route path="/parada/:id" element={<ParadaDetailPage />} />
          <Route path="/parada/:id/qr" element={<ParadaQRPage />} />
          
          <Route path="/noticias" element={<NoticiasPage />} />
          <Route path="/noticia/:id" element={<NoticiaDetailPage />} />
          
          <Route path="/search" element={<SearchPage />} />
          
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
