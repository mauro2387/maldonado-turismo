import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, MapPin, Clock, AlertCircle, Search, Loader2, Navigation, Route as RouteIcon, QrCode } from 'lucide-react';
import { useStops, useRoutes, useAlerts } from '@hooks/useTransport';
import { BusStop } from '@services/transportService';
import QuickActionsGrid from '@components/transporte/QuickActionsGrid';

type Tab = 'stops' | 'routes' | 'alerts' | 'planner';

export default function TransportePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('stops');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [nearbyStops, setNearbyStops] = useState<BusStop[]>([]);

  // Fetch data from API
  const { stops, loading: loadingStops, error: errorStops, refetch: refetchStops } = useStops();
  const { routes, loading: loadingRoutes, error: errorRoutes } = useRoutes();
  const { alerts, loading: loadingAlerts, error: errorAlerts } = useAlerts();

  // Log data for debugging
  useEffect(() => {
    console.log('📍 Stops loaded:', stops.length, stops);
    console.log('🚌 Routes loaded:', routes.length, routes);
    console.log('⚠️ Alerts loaded:', alerts.length, alerts);
  }, [stops, routes, alerts]);

  const displayStops = nearbyStops.length > 0 ? nearbyStops : stops;

  const filteredStops = displayStops.filter((stop) => {
    const matchesSearch = stop.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         stop.zone.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRoute = !selectedRoute || stop.routes?.includes(selectedRoute.toString());
    return matchesSearch && matchesRoute;
  });

  const handleNearbyStops = async () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }

    setLoadingNearby(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const { transportService } = await import('@services/transportService');
          const nearby = await transportService.getNearbyStops(latitude, longitude, 1000);
          setNearbyStops(nearby);
          setLoadingNearby(false);
        } catch (error) {
          console.error('Error getting nearby stops:', error);
          alert('Error al obtener paradas cercanas');
          setLoadingNearby(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('No se pudo obtener tu ubicación');
        setLoadingNearby(false);
      }
    );
  };

  const handleClearNearby = () => {
    setNearbyStops([]);
    refetchStops();
  };

  const handleViewInMap = (stopId: number) => {
    // Navegar al mapa con la parada seleccionada
    navigate(`/mapa?stop=${stopId}`);
  };

  return (
    <div className="bg-gray-50 pb-20 overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Transporte Público</h1>

          {/* Quick Access Grid */}
          <QuickActionsGrid />

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200 -mb-px overflow-x-auto scrollbar-hide -mx-4 px-4">
            <button
              onClick={() => setActiveTab('stops')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === 'stops'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin size={18} />
                <span>Paradas</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('routes')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === 'routes'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Bus size={18} />
                <span>Líneas</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors relative whitespace-nowrap flex-shrink-0 ${
                activeTab === 'alerts'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={18} />
                <span>Avisos</span>
                {alerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {alerts.length}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('planner')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === 'planner'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <RouteIcon size={18} />
                <span>Planificar</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
        {/* Loading state */}
        {((activeTab === 'stops' && loadingStops) || (activeTab === 'routes' && loadingRoutes) || (activeTab === 'alerts' && loadingAlerts)) && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-primary-600" size={48} />
          </div>
        )}

        {/* Error state */}
        {((activeTab === 'stops' && errorStops) || (activeTab === 'routes' && errorRoutes) || (activeTab === 'alerts' && errorAlerts)) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-red-800 mb-2">
              Error al cargar {activeTab === 'stops' ? 'paradas' : activeTab === 'routes' ? 'líneas' : 'avisos'}: {errorStops || errorRoutes || errorAlerts}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-red-600 hover:text-red-700 underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Tab: Paradas */}
        {activeTab === 'stops' && !loadingStops && !errorStops && (
          <>
            {/* Search and filters */}
            <div className="mb-6 space-y-4">
              {/* Nearby button */}
              <div className="flex gap-2">
                <button
                  onClick={handleNearbyStops}
                  disabled={loadingNearby}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {loadingNearby ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      <span>Buscando...</span>
                    </>
                  ) : (
                    <>
                      <MapPin size={16} />
                      <span>Cerca de mí</span>
                    </>
                  )}
                </button>
                {nearbyStops.length > 0 && (
                  <button
                    onClick={handleClearNearby}
                    className="btn btn-secondary"
                  >
                    Ver todas las paradas
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Buscar parada..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Route filter */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                  onClick={() => setSelectedRoute(null)}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-colors ${
                    !selectedRoute
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Todas
                </button>
                {routes.map((route) => (
                  <button
                    key={route.id}
                    onClick={() => setSelectedRoute(route.id)}
                    className={`px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-colors ${
                      selectedRoute === route.id
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {route.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Stops list */}
            <div className="space-y-4">
              {filteredStops.length === 0 ? (
                <div className="text-center py-12">
                  <Bus className="mx-auto text-gray-400 mb-4" size={48} />
                  <p className="text-gray-600">No se encontraron paradas</p>
                </div>
              ) : (
                filteredStops.map((stop) => (
                <div
                  key={stop.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/transporte/paradas/${stop.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">{stop.name}</h3>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {stop.code}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/transporte/paradas/${stop.id}/qr`);
                          }}
                          className="p-1 hover:bg-purple-50 rounded transition-colors"
                          title="Ver código QR"
                        >
                          <QrCode size={18} className="text-purple-600" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{stop.zone}</p>
                      {stop.description && (
                        <p className="text-sm text-gray-500">{stop.description}</p>
                      )}
                      
                      {/* Servicios disponibles */}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {stop.has_shelter && (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                            🏠 Refugio
                          </span>
                        )}
                        {stop.has_bench && (
                          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                            💺 Asiento
                          </span>
                        )}
                        {stop.has_lighting && (
                          <span className="inline-flex items-center gap-1 text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded">
                            💡 Iluminación
                          </span>
                        )}
                        {stop.accessibility && (
                          <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">
                            ♿ Accesible
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewInMap(stop.id);
                      }}
                      className="btn btn-secondary text-sm whitespace-nowrap"
                    >
                      Ver en mapa
                    </button>
                  </div>

                  {/* Routes */}
                  {stop.routes && stop.routes.length > 0 && (
                    <div className="flex gap-2 mb-3">
                      {stop.routes.map((routeId: string) => (
                        <span
                          key={routeId}
                          className="bg-primary-600 text-white px-2 py-1 rounded text-xs font-semibold"
                        >
                          {routeId}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Next buses */}
                  {stop.nextBuses && stop.nextBuses.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase">Próximos buses</p>
                      {stop.nextBuses.map((bus: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="bg-primary-600 text-white px-2 py-0.5 rounded text-xs font-semibold">
                              {bus.route}
                            </span>
                            <span className="text-gray-600">{bus.destination}</span>
                          </div>
                          <div className="flex items-center gap-1 text-primary-600 font-semibold">
                            <Clock size={14} />
                            <span>{bus.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            </div>
          </>
        )}

        {/* Tab: Líneas */}
        {activeTab === 'routes' && !loadingRoutes && !errorRoutes && (
          <div className="space-y-4">
            {routes.length === 0 ? (
              <div className="text-center py-12">
                <Bus className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600">No hay líneas disponibles</p>
              </div>
            ) : (
              routes.map((route) => (
                <div
                  key={route.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div 
                      className="text-white w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg"
                      style={{ backgroundColor: route.route_color || '#1976D2' }}
                    >
                      {route.code}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{route.name}</h3>
                      {route.frequency_minutes && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                          <Clock size={14} />
                          <span>Frecuencia: cada {route.frequency_minutes} minutos</span>
                        </div>
                      )}
                    </div>
                    <button className="btn btn-primary text-sm">
                      Ver recorrido
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab: Avisos */}
        {activeTab === 'alerts' && !loadingAlerts && !errorAlerts && (
          <div className="space-y-4">
            {alerts.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600">No hay avisos en este momento</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-xl p-4 border-l-4 ${
                    alert.type === 'warning'
                      ? 'bg-yellow-50 border-yellow-500'
                      : alert.type === 'danger'
                      ? 'bg-red-50 border-red-500'
                      : 'bg-blue-50 border-blue-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle
                      size={24}
                      className={
                        alert.type === 'warning' 
                          ? 'text-yellow-600' 
                          : alert.type === 'danger'
                          ? 'text-red-600'
                          : 'text-blue-600'
                      }
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{alert.title}</h3>
                      <p className="text-sm text-gray-700 mb-2">{alert.message}</p>
                      {alert.startDate && (
                        <p className="text-xs text-gray-500">
                          {new Date(alert.startDate).toLocaleDateString('es-UY', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab: Planificador */}
        {activeTab === 'planner' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Planificar tu viaje</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Origen
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      placeholder="Desde dónde viajas..."
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <button 
                    onClick={handleNearbyStops}
                    className="mt-2 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                  >
                    <Navigation size={14} />
                    Usar mi ubicación actual
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Destino
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={20} />
                    <input
                      type="text"
                      placeholder="A dónde quieres ir..."
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <button className="w-full btn btn-primary flex items-center justify-center gap-2 py-3">
                  <RouteIcon size={20} />
                  <span>Buscar rutas</span>
                </button>
              </div>
            </div>

            {/* Placeholder for future route suggestions */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
              <RouteIcon className="mx-auto text-blue-400 mb-3" size={48} />
              <h3 className="font-semibold text-blue-900 mb-2">Próximamente</h3>
              <p className="text-sm text-blue-700">
                Ingresa origen y destino para ver las mejores rutas, tiempos estimados y paradas más cercanas con las líneas que te sirven.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
