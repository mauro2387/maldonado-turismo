import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteIcon, Clock, Loader2, AlertCircle } from 'lucide-react';
import Breadcrumbs from '@components/Breadcrumbs';
import LocationAutocomplete from '@components/transporte/LocationAutocomplete';
import { useStops, useRoutes } from '@hooks/useTransport';
import { BusStop } from '@services/transportService';
import { routePlannerService, RouteOption } from '@services/routePlannerService';

export default function PlanificadorPage() {
  const navigate = useNavigate();
  const { stops, loading: loadingStops } = useStops();
  const { routes: busRoutes, loading: loadingRoutes } = useRoutes();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originStop, setOriginStop] = useState<BusStop | null>(null);
  const [destStop, setDestStop] = useState<BusStop | null>(null);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleOriginChange = (value: string, stop?: BusStop) => {
    setOrigin(value);
    setOriginStop(stop || null);
    setUserLocation(null); // Clear user location if manually typing
  };

  const handleDestinationChange = (value: string, stop?: BusStop) => {
    setDestination(value);
    setDestStop(stop || null);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }

    setUseCurrentLocation(true);
    setError(null);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        
        // Buscar la parada más cercana
        const nearest = routePlannerService.findNearestStop(latitude, longitude, stops);
        
        if (nearest) {
          const distance = routePlannerService.calculateDistance(
            latitude,
            longitude,
            nearest.lat,
            nearest.lng
          );
          
          setOrigin(`${nearest.name} (${Math.round(distance * 1000)}m)`);
          setOriginStop(nearest);
        } else {
          setOrigin(`Mi ubicación (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
        }
        
        setUseCurrentLocation(false);
      },
      (error) => {
        console.error('Error getting location:', error);
        setError('No se pudo obtener tu ubicación. Verifica los permisos del navegador.');
        setUseCurrentLocation(false);
      }
    );
  };

  const handleSearch = async () => {
    if (!origin || !destination) {
      setError('Por favor completa origen y destino');
      return;
    }

    if (loadingStops || loadingRoutes) {
      setError('Cargando datos de paradas y rutas...');
      return;
    }

    setSearching(true);
    setError(null);

    try {
      let finalOriginStop = originStop;
      let finalDestStop = destStop;

      // Si no tenemos stop seleccionado, buscar por nombre
      if (!finalOriginStop) {
        finalOriginStop = stops.find(s => s.name.toLowerCase() === origin.toLowerCase()) || null;
      }

      if (!finalDestStop) {
        finalDestStop = stops.find(s => s.name.toLowerCase() === destination.toLowerCase()) || null;
      }

      if (!finalOriginStop) {
        setError(`No se encontró la parada de origen: ${origin}`);
        setSearching(false);
        return;
      }

      if (!finalDestStop) {
        setError(`No se encontró la parada de destino: ${destination}`);
        setSearching(false);
        return;
      }

      // Calcular rutas con mejor algoritmo
      const foundRoutes = routePlannerService.findRoutes(
        finalOriginStop,
        finalDestStop,
        stops,
        busRoutes,
        userLocation || undefined
      );

      if (foundRoutes.length === 0) {
        setError('No se encontraron rutas disponibles entre estas paradas');
      } else {
        setRoutes(foundRoutes);
      }
    } catch (err) {
      console.error('Error searching routes:', err);
      setError('Ocurrió un error al buscar rutas');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="container mx-auto px-4 py-4">
          <Breadcrumbs
            items={[
              { label: 'Transporte', path: '/transporte' },
              { label: 'Planificador de Viajes' },
            ]}
          />
          <h1 className="text-2xl font-bold text-gray-900">Planificar tu viaje</h1>
          <p className="text-gray-600 mt-1">Encuentra la mejor ruta para llegar a tu destino</p>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Search Form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="space-y-4">
              {/* Origen con Autocomplete */}
              <LocationAutocomplete
                value={origin}
                onChange={handleOriginChange}
                stops={stops}
                placeholder="Desde dónde viajas..."
                label="Origen"
                icon="origin"
                showCurrentLocation={true}
                onUseCurrentLocation={handleGetCurrentLocation}
                usingCurrentLocation={useCurrentLocation}
              />

              {/* Destino con Autocomplete */}
              <LocationAutocomplete
                value={destination}
                onChange={handleDestinationChange}
                stops={stops}
                placeholder="A dónde quieres ir..."
                label="Destino"
                icon="destination"
              />

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-800">
                  <AlertCircle size={18} />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* Search Button */}
              <button
                onClick={handleSearch}
                disabled={searching || !origin || !destination || loadingStops || loadingRoutes}
                className="w-full btn btn-primary flex items-center justify-center gap-2 py-3"
              >
                {searching ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    <span>Buscando rutas...</span>
                  </>
                ) : (
                  <>
                    <RouteIcon size={20} />
                    <span>Buscar rutas</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results */}
          {routes.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Rutas disponibles</h2>
              {routes.map((route) => (
                <div
                  key={route.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
                >
                  {/* Route Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="bg-primary-600 text-white px-3 py-1 rounded-lg font-bold">
                          {route.routeCode}
                        </div>
                        <h3 className="font-semibold text-gray-900">{route.routeName}</h3>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Clock size={14} />
                          <span>{route.duration} min</span>
                        </div>
                        {route.transfers > 0 && (
                          <div className="flex items-center gap-1">
                            <RouteIcon size={14} />
                            <span>{route.transfers} transbordo{route.transfers > 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/transporte/mapa')}
                      className="btn btn-secondary text-sm"
                    >
                      Ver en mapa
                    </button>
                  </div>

                  {/* Route Steps */}
                  <div className="space-y-3 pl-4 border-l-2 border-gray-200">
                    {route.steps.map((step, idx) => (
                      <div key={idx} className="relative pl-6">
                        <div className="absolute -left-[9px] top-2 w-4 h-4 rounded-full bg-white border-2 border-gray-300" />
                        {step.type === 'walk' ? (
                          <div className="text-sm">
                            <p className="font-medium text-gray-700">
                              🚶 Caminar {step.distance}m ({step.duration} min)
                            </p>
                            <p className="text-gray-500 text-xs mt-1">
                              {step.from} → {step.to}
                            </p>
                          </div>
                        ) : step.type === 'wait' ? (
                          <div className="text-sm">
                            <p className="font-medium text-gray-700">
                              ⏱️ Esperar {step.waitTime} min
                            </p>
                            <p className="text-gray-500 text-xs mt-1">
                              En {step.from}
                            </p>
                          </div>
                        ) : (
                          <div className="text-sm">
                            <p className="font-medium text-gray-700">
                              🚌 Línea {step.routeCode} ({step.duration} min)
                            </p>
                            <p className="text-gray-500 text-xs mt-1">
                              {step.from} → {step.to}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No results placeholder */}
          {routes.length === 0 && !searching && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
              <RouteIcon className="mx-auto text-blue-400 mb-3" size={48} />
              <h3 className="font-semibold text-blue-900 mb-2">¿A dónde quieres ir?</h3>
              <p className="text-sm text-blue-700">
                Ingresa tu origen y destino para ver las mejores rutas, tiempos estimados y paradas más cercanas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
