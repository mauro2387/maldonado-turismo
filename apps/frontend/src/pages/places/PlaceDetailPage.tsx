import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  MapPin, ArrowLeft, Star, Clock, Phone, Globe, Bus, 
  Share2, Heart, Navigation, Calendar, Camera, Loader2
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePlace } from '@hooks/usePlaces';

export default function PlaceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);

  // Confirmación de "enlace copiado" dentro de la interfaz. Antes era un
  // alert() del navegador, que bloquea la pantalla y se ve distinto en cada
  // sistema operativo.
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);


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
            onClick={() => navigate('/que-hacer?ver=lugares')}
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
          <button onClick={() => navigate('/que-hacer?ver=lugares')} className="btn btn-primary">
            Ver todos los lugares
          </button>
        </div>
      </div>
    );
  }

  // La foto que se está viendo y su crédito. `image_credits` va en el mismo
  // orden que `images`, así que alcanza con el índice seleccionado.
  const credit = place.image_credits?.[selectedImageIndex] ?? null;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: place.name,
          text: place.description,
          url: window.location.href,
        });
      } catch (err) {
        // El usuario canceló el diálogo de compartir: no hay nada que avisar.
      }
    } else {
      // Fallback: copiar al portapapeles
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
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

        {/*
          Crédito de la foto que se está viendo. Las imágenes vienen de
          Wikimedia Commons bajo licencias CC BY y CC BY-SA, que obligan a
          nombrar al autor y enlazar la licencia: esto no es decorativo.
        */}
        {credit && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-8 pb-2">
            <p className="text-[11px] leading-tight text-white/80">
              Foto: {credit.author}
              {' · '}
              {credit.license_url ? (
                <a
                  href={credit.license_url}
                  target="_blank"
                  rel="noreferrer noopener license"
                  className="underline hover:text-white"
                >
                  {credit.license}
                </a>
              ) : (
                credit.license
              )}
              {' · '}
              <a
                href={credit.source}
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-white"
              >
                Wikimedia Commons
              </a>
            </p>
          </div>
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
          {/* El puente entre el contenido turístico y el transporte: la app ya
              tiene las paradas, las líneas y las unidades en vivo, así que
              "cómo llegar" no tiene por qué mandarte afuera. */}
          {((place.latitude && place.longitude) || (place.lat && place.lng)) && (
            <Link
              to={`/transporte/planificador?destino=${encodeURIComponent(place.name)}`}
              className="btn btn-primary flex flex-col items-center justify-center gap-1 py-3 text-xs sm:text-sm"
            >
              <Bus size={20} />
              <span className="whitespace-nowrap">Ir en ómnibus</span>
            </Link>
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
            to="/que-hacer"
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

      {copied && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-float md:bottom-8"
        >
          Enlace copiado
        </div>
      )}
    </div>
  );
}
