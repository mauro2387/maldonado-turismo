import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Bus, Cloud, Search } from 'lucide-react';
import { useEvents } from '@hooks/useEvents';
import { usePlaces } from '@hooks/usePlaces';

export default function HomePage() {
  const { t } = useTranslation();
  const { events, loading: loadingEvents } = useEvents();
  const { places, loading: loadingPlaces } = usePlaces();

  // Get first 2 events and first 2 places for featured section
  const featuredEvents = events.slice(0, 2);
  const featuredPlaces = places.slice(0, 2);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('home.welcome')}</h1>
        <p className="text-gray-600">Tu guía completa de turismo y servicios</p>
      </div>

      {/* Quick access cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link to="/places" className="card group hover:shadow-md transition-shadow">
          <Search className="h-8 w-8 text-purple-600 mb-2" />
          <h3 className="font-semibold text-gray-900">Lugares</h3>
          <p className="text-xs text-gray-500 mt-1">Explorar destinos</p>
        </Link>

        <Link to="/agenda" className="card group hover:shadow-md transition-shadow">
          <Calendar className="h-8 w-8 text-primary-600 mb-2" />
          <h3 className="font-semibold text-gray-900">{t('home.todayEvents')}</h3>
          <p className="text-xs text-gray-500 mt-1">Ver eventos</p>
        </Link>

        <Link to="/mapa" className="card group hover:shadow-md transition-shadow">
          <MapPin className="h-8 w-8 text-secondary-600 mb-2" />
          <h3 className="font-semibold text-gray-900">{t('home.nearMe')}</h3>
          <p className="text-xs text-gray-500 mt-1">Explorar mapa</p>
        </Link>

        <Link to="/transporte" className="card group hover:shadow-md transition-shadow">
          <Bus className="h-8 w-8 text-blue-600 mb-2" />
          <h3 className="font-semibold text-gray-900">{t('home.nearStops')}</h3>
          <p className="text-xs text-gray-500 mt-1">Horarios</p>
        </Link>
      </div>

      {/* Weather widget */}
      <div className="card mt-4 bg-gradient-to-r from-blue-50 to-cyan-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">{t('home.weather')}</h3>
            <p className="text-sm text-gray-600">Punta del Este</p>
          </div>
          <div className="flex items-center gap-3">
            <Cloud className="h-10 w-10 text-orange-500" />
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">22°C</p>
              <p className="text-sm text-gray-600">Soleado</p>
            </div>
          </div>
        </div>
      </div>

      {/* Featured content */}
      <section className="mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Destacados</h2>
        
        {loadingEvents || loadingPlaces ? (
          <div className="space-y-4">
            <div className="card animate-pulse">
              <div className="flex items-start space-x-4">
                <div className="h-20 w-20 rounded-lg bg-gray-200 flex-shrink-0"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Featured Events */}
            {featuredEvents.map((event) => (
              <Link 
                key={event.id} 
                to={`/evento/${event.id}`}
                className="card hover:shadow-md transition-shadow block"
              >
                <div className="flex items-start space-x-4">
                  <img 
                    src={event.image || 'https://via.placeholder.com/80'} 
                    alt={event.title}
                    className="h-20 w-20 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{event.title}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.description}</p>
                    <span className="inline-block mt-2 text-xs text-primary-600 font-medium">Evento destacado</span>
                  </div>
                </div>
              </Link>
            ))}

            {/* Featured Places */}
            {featuredPlaces.map((place) => (
              <Link 
                key={place.id} 
                to={`/places/${place.id}`}
                className="card hover:shadow-md transition-shadow block"
              >
                <div className="flex items-start space-x-4">
                  <img 
                    src={place.images?.[0] || 'https://via.placeholder.com/80'} 
                    alt={place.name}
                    className="h-20 w-20 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{place.name}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{place.description}</p>
                    <span className="inline-block mt-2 text-xs text-secondary-600 font-medium">Lugar destacado</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
