import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  Bus,
  Users, 
  Share2, 
  Heart,
  ExternalLink,
  Phone,
  Mail,
  Globe,
  Ticket,
  Loader2
} from 'lucide-react';
import { useEvent } from '@hooks/useEvents';

export default function EventoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isInterested, setIsInterested] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);

  // Confirmación de "enlace copiado" dentro de la interfaz. Antes era un
  // alert() del navegador, que bloquea la pantalla y se ve distinto en cada
  // sistema operativo.
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);


  // Fetch event from API
  const { event, loading, error } = useEvent(id);

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
          <Calendar className="mx-auto h-16 w-16 text-red-300 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error al cargar el evento</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/que-hacer')}
            className="btn btn-primary"
          >
            Volver a eventos
          </button>
        </div>
      </div>
    );
  }

  // Not found
  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Calendar className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Evento no encontrado</h2>
          <p className="text-gray-600 mb-4">El evento que buscas no existe o ha sido eliminado.</p>
          <button
            onClick={() => navigate('/que-hacer')}
            className="btn btn-primary"
          >
            Volver a eventos
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-UY', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long',
      year: 'numeric'
    });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: event.description,
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

  const handleOpenInMaps = () => {
    if (event.address) {
      const query = encodeURIComponent(event.address);
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header con imagen */}
      <div className="relative h-64 md:h-96">
        <img
          src={event.gallery?.[selectedImage] || event.image || 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Jazz_concert_outdoor.jpg/1280px-Jazz_concert_outdoor.jpg'}
          alt={event.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Botón volver */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-lg hover:bg-white transition-colors"
        >
          <ArrowLeft size={24} />
        </button>

        {/* Botones de acción */}
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className={`p-2 rounded-full shadow-lg backdrop-blur-sm transition-colors ${
              isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-700 hover:bg-white'
            }`}
          >
            <Heart size={24} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={handleShare}
            className="bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-lg hover:bg-white transition-colors"
          >
            <Share2 size={24} />
          </button>
        </div>

        {/* Galería miniatura */}
        {event.gallery && event.gallery.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 flex gap-2 overflow-x-auto">
            {event.gallery.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedImage(idx)}
                className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  selectedImage === idx ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <span className="inline-block bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-semibold mb-2">
                {event.category}
              </span>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{event.title}</h1>
              <p className="text-gray-600">{event.description}</p>
            </div>
          </div>

          {/* Información clave */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="bg-primary-100 p-2 rounded-lg">
                <Calendar className="text-primary-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Fecha</p>
                <p className="font-semibold text-gray-900">{formatDate(event.date)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-primary-100 p-2 rounded-lg">
                <Clock className="text-primary-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Horario</p>
                <p className="font-semibold text-gray-900">
                  {event.time}{event.endTime && ` - ${event.endTime}`} hs
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-primary-100 p-2 rounded-lg">
                <MapPin className="text-primary-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Ubicación</p>
                <p className="font-semibold text-gray-900">{event.location}</p>
              </div>
            </div>

            {event.price && (
              <div className="flex items-center gap-3">
                <div className="bg-primary-100 p-2 rounded-lg">
                  <Ticket className="text-primary-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Entrada</p>
                  <p className="font-semibold text-gray-900">{event.price}</p>
                </div>
              </div>
            )}
          </div>

          {/* Botón de interés */}
          <div className="flex items-center gap-4 pt-4 mt-4 border-t border-gray-100">
            <button
              onClick={() => setIsInterested(!isInterested)}
              className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-colors ${
                isInterested
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              {isInterested ? '✓ Confirmado' : 'Me interesa'}
            </button>
            {(event.attendees || event.capacity) && (
              <div className="flex items-center gap-2 text-gray-600">
                <Users size={20} />
                <span className="text-sm">
                  {event.attendees || 0}{event.capacity && `/${event.capacity}`} personas
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Descripción completa */}
        {event.longDescription && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Sobre el evento</h2>
            <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-line">
              {event.longDescription}
            </div>
          </div>
        )}

        {/* Tags */}
        {event.tags && event.tags.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Etiquetas</h2>
            <div className="flex flex-wrap gap-2">
              {event.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Cómo llegar: el dato que ninguna app genérica de eventos puede dar,
            porque hace falta conocer las paradas y las líneas de la ciudad. */}
        <Link
          to={`/transporte/planificador?destino=${encodeURIComponent(event.location || event.title)}`}
          className="btn btn-primary mb-6 w-full"
        >
          <Bus size={18} />
          Cómo llegar en ómnibus
        </Link>

        {/* Ubicación */}
        {event.address && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Ubicación</h2>
            <p className="text-gray-600 mb-4">{event.address}</p>
            <button
              onClick={handleOpenInMaps}
              className="btn btn-secondary w-full flex items-center justify-center gap-2"
            >
              <ExternalLink size={18} />
              Abrir en Google Maps
            </button>
          </div>
        )}

        {/* Organizador */}
        {(event.organizer || event.contact) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Organizador</h2>
            {event.organizer && <p className="font-semibold text-gray-900 mb-4">{event.organizer}</p>}
            
            {event.contact && (
              <div className="space-y-3">
                {event.contact.phone && (
                  <a
                    href={`tel:${event.contact.phone}`}
                    className="flex items-center gap-3 text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    <Phone size={18} />
                    <span>{event.contact.phone}</span>
                  </a>
                )}
                {event.contact.email && (
                  <a
                    href={`mailto:${event.contact.email}`}
                    className="flex items-center gap-3 text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    <Mail size={18} />
                    <span>{event.contact.email}</span>
                  </a>
                )}
                {event.contact.website && (
                  <a
                    href={event.contact.website.startsWith('http') ? event.contact.website : `https://${event.contact.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    <Globe size={18} />
                    <span>Sitio web</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Avisos */}
        {event.weatherDependent && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              ⚠️ Este evento está sujeto a condiciones climáticas. Verificar antes de asistir.
            </p>
          </div>
        )}
        
        {event.accessibility && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800">
              ♿ Este evento es accesible para personas con movilidad reducida.
            </p>
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
