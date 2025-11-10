import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, Clock, Users, Filter, Search, Loader2 } from 'lucide-react';
import { useEvents } from '@hooks/useEvents';

const CATEGORIES = ['Todos', 'Música', 'Cultura', 'Deportes', 'Arte', 'Gastronomía', 'Educación'];

type TimeFilter = 'today' | 'week' | 'month' | 'all';

export default function AgendaPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch events from API
  const { events, loading, error } = useEvents({
    search: searchQuery,
    category: selectedCategory !== 'Todos' ? selectedCategory : undefined,
  });

  // Apply time filter to events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Time filter logic
      const eventDate = new Date(event.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to midnight for accurate comparison
      
      if (timeFilter === 'today') {
        const eventDay = new Date(event.date);
        eventDay.setHours(0, 0, 0, 0);
        return eventDay.getTime() === today.getTime();
      } else if (timeFilter === 'week') {
        const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        return eventDate >= today && eventDate <= weekFromNow;
      } else if (timeFilter === 'month') {
        const monthFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        return eventDate >= today && eventDate <= monthFromNow;
      }
      
      return true; // 'all' - no time filter
    });
  }, [events, timeFilter]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-UY', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Agenda de Eventos</h1>
          
          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar eventos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Time filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setTimeFilter('today')}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${
                timeFilter === 'today'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setTimeFilter('week')}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${
                timeFilter === 'week'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Esta semana
            </button>
            <button
              onClick={() => setTimeFilter('month')}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${
                timeFilter === 'month'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Este mes
            </button>
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${
                timeFilter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="ml-auto px-4 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-2"
            >
              <Filter size={16} />
              Filtros
            </button>
          </div>

          {/* Category filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 animate-fade-in">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Categorías</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-colors ${
                      selectedCategory === category
                        ? 'bg-primary-100 text-primary-700 border-2 border-primary-600'
                        : 'bg-white text-gray-700 border border-gray-300 hover:border-primary-300'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Events list */}
      <div className="container mx-auto px-4 py-6">
        {/* Loading state */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-primary-600" size={48} />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-red-800 mb-2">Error al cargar eventos: {error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-red-600 hover:text-red-700 underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Events content */}
        {!loading && !error && (
          <>
            <div className="mb-4 text-sm text-gray-600">
              {filteredEvents.length} {filteredEvents.length === 1 ? 'evento encontrado' : 'eventos encontrados'}
            </div>

            {filteredEvents.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600 text-lg">No se encontraron eventos</p>
                <p className="text-gray-500 text-sm mt-2">Intenta cambiar los filtros</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={() => navigate(`/evento/${event.id}`)}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  >
                    {/* Event image */}
                    <div className="relative h-48">
                      <img
                        src={event.image || 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Jazz_concert_outdoor.jpg/1280px-Jazz_concert_outdoor.jpg'}
                        alt={event.title}
                        className="w-full h-full object-cover"
                      />
                      {event.category && (
                        <div className="absolute top-3 right-3 bg-white px-2 py-1 rounded-full text-xs font-semibold">
                          {event.category}
                        </div>
                      )}
                      <div className="absolute bottom-3 left-3 bg-primary-600 text-white px-3 py-1 rounded-lg text-sm font-semibold">
                        {formatDate(event.date)}
                      </div>
                    </div>

                    {/* Event info */}
                    <div className="p-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                        {event.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {event.description}
                      </p>

                      <div className="space-y-2">
                        {event.time && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock size={16} className="text-gray-400" />
                            <span>{event.time} hs</span>
                          </div>
                        )}
                        {event.location && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin size={16} className="text-gray-400" />
                            <span>{event.location}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                          {event.attendees && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Users size={16} className="text-gray-400" />
                              <span>{event.attendees} interesados</span>
                            </div>
                          )}
                          {event.price && (
                            <span className="text-sm font-semibold text-primary-600">
                              {event.price}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

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

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
