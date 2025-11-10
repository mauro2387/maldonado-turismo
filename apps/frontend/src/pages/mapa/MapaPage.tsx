import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView, MapLocation } from '@components/map/MapView';
import { Search, Layers, MapPin, Calendar, Navigation, Loader2 } from 'lucide-react';
import { usePlaces } from '@hooks/usePlaces';
import { useEvents } from '@hooks/useEvents';

const CATEGORIES = [
  { id: 'all', label: 'Todos', icon: MapPin },
  { id: 'Playas', label: 'Playas', icon: MapPin },
  { id: 'Museos', label: 'Museos', icon: MapPin },
  { id: 'Naturaleza', label: 'Naturaleza', icon: MapPin },
  { id: 'events', label: 'Eventos', icon: Calendar },
];

export default function MapaPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showLayers, setShowLayers] = useState(false);
  const [activeLayers, setActiveLayers] = useState({
    places: true,
    events: true,
    transport: false,
  });

  // Fetch places from API
  const { places, loading: loadingPlaces, error: errorPlaces } = usePlaces({
    search: searchQuery,
    category: selectedCategory !== 'all' && selectedCategory !== 'events' ? selectedCategory : undefined,
  });

  // Fetch events from API
  const { events, loading: loadingEvents, error: errorEvents } = useEvents({
    search: searchQuery,
  });

  const loading = loadingPlaces || loadingEvents;
  const error = errorPlaces || errorEvents;

  // Convert places to MapLocation format (filter out places without coordinates)
  const placesLocations: MapLocation[] = places
    .filter((place) => {
      const lat = place.lat || place.latitude;
      const lng = place.lng || place.longitude;
      return lat !== undefined && lng !== undefined;
    })
    .map((place) => ({
      id: place.id,
      name: place.name,
      lat: (place.lat || place.latitude)!,
      lng: (place.lng || place.longitude)!,
      category: place.category,
      description: place.description,
      image: place.images?.[0],
      type: 'place' as const,
    }));

  // Convert events to MapLocation format (filter out events without coordinates)
  const eventsLocations: MapLocation[] = events
    .filter((event) => {
      return event.lat !== undefined && event.lng !== undefined;
    })
    .map((event) => ({
      id: event.id,
      name: event.title,
      lat: event.lat!,
      lng: event.lng!,
      category: event.category,
      description: event.description,
      image: event.image,
      type: 'event' as const,
    }));

  // Combine locations based on active layers
  const mapLocations: MapLocation[] = [
    ...(activeLayers.places ? placesLocations : []),
    ...(activeLayers.events ? eventsLocations : []),
  ];

  const handleLocationClick = (location: MapLocation) => {
    if (location.type === 'event') {
      navigate(`/evento/${location.id}`);
    } else {
      navigate(`/place/${location.id}`);
    }
  };

  const toggleLayer = (layer: keyof typeof activeLayers) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const handleToggleLayersMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowLayers(!showLayers);
  };

  return (
    <div className="relative w-full h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[1001] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin text-primary-600 mx-auto mb-2" size={48} />
            <p className="text-gray-600">Cargando lugares...</p>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1001] w-full max-w-md px-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg">
            <p className="text-red-800 mb-2">Error al cargar lugares: {error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-red-600 hover:text-red-700 underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Search bar - Arriba centrado y compacto */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] w-64 md:w-80">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar en el mapa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border-0 shadow-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          />
        </div>
      </div>

      {/* Layer controls - Abajo a la derecha, sobre las categorías */}
      <div className="absolute bottom-28 right-4 z-[460] flex flex-col gap-2 md:bottom-20">
        <button
          onClick={handleToggleLayersMenu}
          className="btn btn-primary shadow-lg flex items-center gap-2 px-3 py-3 md:px-4"
        >
          <Layers size={18} />
          <span className="hidden md:inline">Capas</span>
        </button>

        {showLayers && (
          <div className="bg-white rounded-lg shadow-xl p-4 animate-fade-in">
            <h3 className="font-semibold text-gray-900 mb-3">Capas del mapa</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeLayers.places}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleLayer('places');
                  }}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
                <MapPin size={16} className="text-primary-600" />
                <span className="text-sm">Lugares turísticos</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeLayers.events}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleLayer('events');
                  }}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
                <Calendar size={16} className="text-orange-600" />
                <span className="text-sm">Eventos</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeLayers.transport}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleLayer('transport');
                  }}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
                <Navigation size={16} className="text-blue-600" />
                <span className="text-sm">Paradas de bus</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Category filters - Justo sobre el BottomNav */}
      <div className="absolute bottom-4 left-4 right-4 z-[450] md:bottom-4 pointer-events-none">
        <div className="bg-white rounded-lg shadow-lg p-3 pointer-events-auto">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-3 px-3">
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors flex-shrink-0 ${
                    selectedCategory === category.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-sm font-medium">{category.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Map */}
      <MapView
        locations={mapLocations}
        onLocationClick={handleLocationClick}
        height="100%"
        showControls={true}
        enableGeolocation={true}
      />

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
