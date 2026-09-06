import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, MapPin, Calendar, Newspaper, X, Filter, Loader2 } from 'lucide-react';
import { usePlaces } from '@hooks/usePlaces';
import { useEvents } from '@hooks/useEvents';
import { useNews } from '@hooks/useNews';

type ResultType = 'all' | 'places' | 'events' | 'news';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedType, setSelectedType] = useState<ResultType>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch data from API
  const { places, loading: loadingPlaces, error: errorPlaces } = usePlaces({ search: query });
  const { events, loading: loadingEvents, error: errorEvents } = useEvents({ search: query });
  const { news, loading: loadingNews, error: errorNews } = useNews({ search: query });

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
    }
  }, [searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query.trim() });
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchParams({});
  };

  // Filtrar resultados según el tipo seleccionado
  const getFilteredResults = () => {
    if (!query) {
      return { places: [], events: [], news: [] };
    }

    switch (selectedType) {
      case 'places':
        return { places, events: [], news: [] };
      case 'events':
        return { places: [], events, news: [] };
      case 'news':
        return { places: [], events: [], news };
      default:
        return { places, events, news };
    }
  };

  const results = getFilteredResults();
  const totalResults = results.places.length + results.events.length + results.news.length;
  const loading = loadingPlaces || loadingEvents || loadingNews;
  const error = errorPlaces || errorEvents || errorNews;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Search Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar lugares, eventos, noticias..."
              className="w-full rounded-full border border-gray-300 pl-10 pr-24 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-14 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost rounded-full p-2"
            >
              <Filter size={20} />
            </button>
          </form>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Filters */}
        {showFilters && (
          <div className="mb-6 card animate-fade-in">
            <h3 className="font-semibold text-gray-900 mb-3">Filtrar por tipo</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'Todos' },
                { value: 'places', label: 'Lugares' },
                { value: 'events', label: 'Eventos' },
                { value: 'news', label: 'Noticias' },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value as ResultType)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedType === type.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Type Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { value: 'all', label: 'Todos', icon: Search },
            { value: 'places', label: 'Lugares', icon: MapPin },
            { value: 'events', label: 'Eventos', icon: Calendar },
            { value: 'news', label: 'Noticias', icon: Newspaper },
          ].map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value as ResultType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedType === type.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Icon size={16} />
                {type.label}
              </button>
            );
          })}
        </div>

        {/* Loading state */}
        {loading && query && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-primary-600" size={48} />
          </div>
        )}

        {/* Error state */}
        {error && !loading && query && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-red-800 mb-2">Error al realizar la búsqueda: {error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && !error && !query ? (
          <div className="text-center py-12">
            <Search className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Comienza tu búsqueda
            </h3>
            <p className="text-gray-600">
              Busca lugares turísticos, eventos o noticias
            </p>
          </div>
        ) : !loading && !error && totalResults === 0 ? (
          <div className="text-center py-12">
            <Search className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No se encontraron resultados
            </h3>
            <p className="text-gray-600 mb-4">
              Intenta con otros términos de búsqueda
            </p>
            <button onClick={clearSearch} className="btn btn-primary">
              Limpiar búsqueda
            </button>
          </div>
        ) : !loading && !error ? (
          <>
            {/* Results count */}
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                {totalResults} {totalResults === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                {query && ` para "${query}"`}
              </p>
            </div>

            {/* Places */}
            {results.places.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin className="text-primary-600" size={24} />
                  Lugares ({results.places.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {results.places.map((place) => (
                    <Link
                      key={place.id}
                      to={`/place/${place.id}`}
                      className="card group hover:shadow-lg transition-all"
                    >
                      <div className="flex gap-4">
                        <img
                          src={place.images?.[0] || 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Monument_to_the_Drowned_%28La_Mano%29.jpg/1280px-Monument_to_the_Drowned_%28La_Mano%29.jpg'}
                          alt={place.name}
                          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
                            {place.name}
                          </h3>
                          <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                            {place.description}
                          </p>
                          <span className="inline-block mt-2 text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded">
                            {place.category}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Events */}
            {results.events.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Calendar className="text-primary-600" size={24} />
                  Eventos ({results.events.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {results.events.map((event) => (
                    <Link
                      key={event.id}
                      to={`/evento/${event.id}`}
                      className="card group hover:shadow-lg transition-all"
                    >
                      <div className="flex gap-4">
                        <img
                          src={event.image || 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Jazz_concert_outdoor.jpg/1280px-Jazz_concert_outdoor.jpg'}
                          alt={event.title}
                          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
                            {event.title}
                          </h3>
                          <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                            {event.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                            <MapPin size={12} />
                            {event.location}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* News */}
            {results.news.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Newspaper className="text-primary-600" size={24} />
                  Noticias ({results.news.length})
                </h2>
                <div className="space-y-4">
                  {results.news.map((item) => (
                    <Link
                      key={item.id}
                      to={`/noticia/${item.id}`}
                      className="card group hover:shadow-lg transition-all flex gap-4"
                    >
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                          {item.title}
                        </h3>
                        <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                          {item.summary}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{item.date}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
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
