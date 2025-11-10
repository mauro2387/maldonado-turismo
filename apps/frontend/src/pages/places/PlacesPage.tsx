import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Filter, Star, Navigation, Loader2 } from 'lucide-react';
import { usePlaces } from '@hooks/usePlaces';

const CATEGORIES = ['Todos', 'Playas', 'Museos', 'Parques', 'Monumentos', 'Puertos', 'Naturaleza'];

export default function PlacesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch places from API
  const { places, loading, error } = usePlaces({
    search: searchQuery,
    category: selectedCategory !== 'Todos' ? selectedCategory : undefined,
  });

  const filteredPlaces = places.filter((place) => {
    const matchesSearch = searchQuery === '' || 
                         place.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         place.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || place.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-2">Descubre Maldonado</h1>
          <p className="text-primary-100">Explora los mejores lugares turísticos</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar lugares..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-gray-300 pl-10 pr-12 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost rounded-full p-2"
            >
              <Filter size={20} />
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mb-6 card animate-fade-in">
            <h3 className="font-semibold text-gray-900 mb-3">Filtros</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categoría
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedCategory === category
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Category Pills (always visible) */}
        <div className="mb-6 overflow-x-auto pb-2">
          <div className="flex gap-2 min-w-max">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {filteredPlaces.length} {filteredPlaces.length === 1 ? 'lugar encontrado' : 'lugares encontrados'}
          </p>
          <Link to="/mapa" className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
            <MapPin size={16} />
            Ver en mapa
          </Link>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-primary-600" size={48} />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-red-800">Error al cargar lugares: {error}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Places Grid */}
        {!loading && !error && filteredPlaces.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPlaces.map((place) => (
              <Link
                key={place.id}
                to={`/place/${place.id}`}
                className="card group hover:shadow-lg transition-all duration-200"
              >
                {/* Image */}
                <div className="relative h-48 -m-4 mb-4 overflow-hidden rounded-t-xl">
                  <img
                    src={place.images?.[0] || 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Punta_del_Este_beach_sunset.jpg/1280px-Punta_del_Este_beach_sunset.jpg'}
                    alt={place.name}
                    className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                    <Star className="text-yellow-500 fill-yellow-500" size={14} />
                    {place.rating}
                  </div>
                  <div className="absolute top-2 left-2 bg-primary-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                    {place.category}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <h3 className="font-bold text-gray-900 text-lg mb-1 group-hover:text-primary-600 transition-colors">
                    {place.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {place.description}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-gray-500">
                      <MapPin size={14} />
                      <span>{place.address || place.category}</span>
                    </div>
                    {place.distance && (
                      <div className="flex items-center gap-1 text-primary-600 font-medium">
                        <Navigation size={14} />
                        <span>{place.distance}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : !loading && !error && (
          <div className="text-center py-12">
            <MapPin className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No se encontraron lugares
            </h3>
            <p className="text-gray-600 mb-4">
              Intenta con otros términos de búsqueda o filtros
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('Todos');
              }}
              className="btn btn-primary"
            >
              Limpiar filtros
            </button>
          </div>
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
