import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  MapPin, ArrowLeft, Star, Clock, Phone, Globe, 
  Share2, Heart, Navigation, Calendar, Camera, Loader2
} from 'lucide-react';
import { useState } from 'react';
import { usePlace } from '@hooks/usePlaces';

export default function PlaceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);

  // Fetch place from API
  const { place, loading, error } = usePlace(id);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <MapPin className="mx-auto h-16 w-16 text-red-300 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error al cargar el lugar</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/places')}
            className="btn btn-primary"
          >
            Volver a lugares
          </button>
        </div>
      </div>
    );
  }

  // Not found
  if (!place) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <MapPin className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Lugar no encontrado</h2>
          <p className="text-gray-600 mb-6">El lugar que buscas no existe</p>
          <button onClick={() => navigate('/places')} className="btn btn-primary">
            Ver todos los lugares
          </button>
        </div>
      </div>
    );
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: place.name,
          text: place.description,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      // Fallback: copiar al portapapeles
      navigator.clipboard.writeText(window.location.href);
      alert('¡Enlace copiado al portapapeles!');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header con botón volver */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="hidden sm:inline">Volver</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFavorite(!isFavorite)}
              className="btn-ghost rounded-full p-2"
            >
              <Heart
                size={20}
                className={isFavorite ? 'fill-red-500 text-red-500' : ''}
              />
            </button>
            <button onClick={handleShare} className="btn-ghost rounded-full p-2">
              <Share2 size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Image Gallery */}
      <div className="relative">
        <div className="aspect-[16/9] md:aspect-[21/9] overflow-hidden bg-gray-900">
          <img
            src={place.images?.[selectedImageIndex] || place.images?.[0] || 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Monument_to_the_Drowned_%28La_Mano%29.jpg/1280px-Monument_to_the_Drowned_%28La_Mano%29.jpg'}
            alt={place.name}
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* Thumbnails */}
        {place.images && place.images.length > 0 && (
          <>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {place.images.map((image, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImageIndex === index
                      ? 'border-white scale-110'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={image} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            {/* Image counter */}
            <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
              <Camera size={14} />
              {selectedImageIndex + 1} / {place.images.length}
            </div>
          </>
        )}
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header Info */}
        <div className="mb-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="inline-block bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-medium mb-2">
                {place.category}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                {place.name}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Star className="text-yellow-500 fill-yellow-500" size={18} />
              <span className="font-semibold text-gray-900">{place.rating}</span>
              <span>({place.reviewCount} reseñas)</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin size={16} />
              <span>{place.address || place.category}</span>
            </div>
            {place.distance && (
              <div className="flex items-center gap-1">
                <Navigation size={16} />
                <span>{place.distance} km de tu ubicación</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {((place.latitude && place.longitude) || (place.lat && place.lng)) && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${place.latitude || place.lat},${place.longitude || place.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary flex flex-col items-center justify-center gap-1 py-3 text-xs sm:text-sm"
            >
              <Navigation size={20} />
              <span className="whitespace-nowrap">Cómo llegar</span>
            </a>
          )}
          {place.phone && (
            <a
              href={`tel:${place.phone}`}
              className="btn btn-secondary flex flex-col items-center justify-center gap-1 py-3 text-xs sm:text-sm"
            >
              <Phone size={20} />
              <span>Llamar</span>
            </a>
          )}
          <Link
            to="/agenda"
            className="btn btn-secondary flex flex-col items-center justify-center gap-1 py-3 text-xs sm:text-sm"
          >
            <Calendar size={20} />
            <span>Eventos</span>
          </Link>
        </div>

        {/* Description */}
        <div className="card mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Descripción</h2>
          <p className="text-gray-700 leading-relaxed">{place.description}</p>
        </div>

        {/* Information Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Horarios */}
          {place.schedule && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="text-primary-600" size={20} />
                <h3 className="font-bold text-gray-900">Horarios</h3>
              </div>
              <div className="text-sm space-y-1">
                {typeof place.schedule === 'object' ? (
                  Object.entries(place.schedule).map(([day, hours]) => (
                    <div key={day} className="flex justify-between">
                      <span className="text-gray-600 capitalize">{day}:</span>
                      <span className="font-medium">{hours as string}</span>
                    </div>
                  ))
                ) : (
                  <span className="font-medium">{place.schedule}</span>
                )}
              </div>
            </div>
          )}

          {/* Contacto */}
          {(place.phone || place.website || place.address) && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Phone className="text-primary-600" size={20} />
                <h3 className="font-bold text-gray-900">Contacto</h3>
              </div>
              <div className="space-y-2 text-sm">
                {place.phone && (
                  <a href={`tel:${place.phone}`} className="flex items-center gap-2 text-primary-600 hover:text-primary-700">
                    <Phone size={16} />
                    {place.phone}
                  </a>
                )}
                {place.website && (
                  <a 
                    href={place.website.startsWith('http') ? place.website : `https://${place.website}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-2 text-primary-600 hover:text-primary-700"
                  >
                    <Globe size={16} />
                    {place.website}
                  </a>
                )}
                {place.address && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{place.address}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Facilities */}
        {place.facilities && place.facilities.length > 0 && (
          <div className="card mb-6">
            <h3 className="font-bold text-gray-900 mb-3">Servicios e instalaciones</h3>
            <div className="flex flex-wrap gap-2">
              {place.facilities.map((facility) => (
                <span
                  key={facility}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  {facility}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Activities */}
        {place.activities && place.activities.length > 0 && (
          <div className="card mb-6">
            <h3 className="font-bold text-gray-900 mb-3">Actividades disponibles</h3>
            <div className="flex flex-wrap gap-2">
              {place.activities.map((activity) => (
                <span
                  key={activity}
                  className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm font-medium"
                >
                  {activity}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tips */}
        {place.tips && place.tips.length > 0 && (
          <div className="card mb-6 bg-blue-50 border-blue-200">
            <h3 className="font-bold text-gray-900 mb-3">💡 Consejos útiles</h3>
            <ul className="space-y-2">
              {place.tips.map((tip, index) => (
                <li key={index} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-blue-600 font-bold">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
