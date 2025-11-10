import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bus, MapPin, Clock, QrCode, Share2, Loader2, Navigation2 } from 'lucide-react';
import { BusStop } from '@services/transportService';
import Breadcrumbs from '@components/Breadcrumbs';

export default function ParadaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stop, setStop] = useState<BusStop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStop = async () => {
      try {
        const { transportService } = await import('@services/transportService');
        const stopData = await transportService.getStopById(id!);
        setStop(stopData);
      } catch (err) {
        console.error('Error fetching stop:', err);
        setError('No se pudo cargar la información de la parada');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchStop();
    }
  }, [id]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Parada ${stop?.name}`,
          text: `Información de la parada ${stop?.name}`,
          url: url,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      navigator.clipboard.writeText(url);
      alert('Enlace copiado al portapapeles');
    }
  };

  const handleViewInMap = () => {
    if (stop) {
      navigate(`/mapa?stop=${id}&lat=${stop.lat}&lng=${stop.lng}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  if (error || !stop) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <MapPin className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600 mb-4">{error || 'Parada no encontrada'}</p>
          <button onClick={() => navigate('/transporte')} className="btn btn-primary">
            Volver al transporte
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="container mx-auto px-4 py-4">
          <Breadcrumbs
            items={[
              { label: 'Transporte', path: '/transporte' },
              { label: 'Paradas', path: '/transporte' },
              { label: stop.name },
            ]}
          />
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft size={20} />
            <span>Volver</span>
          </button>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary-100 text-primary-800 px-3 py-1 rounded-lg font-bold text-lg">
                  {stop.code}
                </div>
                <h1 className="text-2xl font-bold text-gray-900">{stop.name}</h1>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin size={16} />
                <span>{stop.zone}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleShare}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Share2 size={16} />
                <span className="hidden md:inline">Compartir</span>
              </button>
              <button
                onClick={() => navigate(`/parada/${id}/qr`)}
                className="btn btn-primary flex items-center gap-2"
              >
                <QrCode size={16} />
                <span className="hidden md:inline">Ver QR</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Info Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {stop.description && (
            <p className="text-gray-700 mb-4">{stop.description}</p>
          )}

          {/* Características */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stop.has_shelter && (
              <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
                <span>🏠</span>
                <span>Refugio</span>
              </div>
            )}
            {stop.has_bench && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                <span>💺</span>
                <span>Asiento</span>
              </div>
            )}
            {stop.has_lighting && (
              <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg">
                <span>💡</span>
                <span>Iluminación</span>
              </div>
            )}
            {stop.accessibility && (
              <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 px-3 py-2 rounded-lg">
                <span>♿</span>
                <span>Accesible</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={handleViewInMap}
              className="w-full btn btn-secondary flex items-center justify-center gap-2"
            >
              <Navigation2 size={20} />
              <span>Ver ubicación en el mapa</span>
            </button>
          </div>
        </div>

        {/* Líneas que pasan */}
        {stop.routes && stop.routes.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Bus size={20} />
              Líneas que pasan por esta parada
            </h2>
            <div className="flex gap-2 flex-wrap">
              {stop.routes.map((routeId: string) => (
                <button
                  key={routeId}
                  onClick={() => navigate(`/transporte/rutas/${routeId}`)}
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
                >
                  {routeId}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Próximos Buses */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Clock size={20} />
            Próximos buses
          </h2>
          {stop.nextBuses && stop.nextBuses.length > 0 ? (
            <div className="space-y-3">
              {stop.nextBuses.map((bus: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-primary-600 text-white px-3 py-1 rounded-lg font-bold">
                      {bus.route}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{bus.destination}</p>
                      <p className="text-sm text-gray-600">{bus.headsign || 'Servicio regular'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-primary-600 font-bold text-lg">
                      <Clock size={18} />
                      <span>{bus.time}</span>
                    </div>
                    <p className="text-xs text-gray-500">minutos</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Bus className="mx-auto text-gray-400 mb-3" size={40} />
              <p className="text-gray-600">No hay información de horarios en este momento</p>
              <p className="text-sm text-gray-500 mt-1">
                La información se actualizará cuando haya buses en circulación
              </p>
            </div>
          )}
        </div>

        {/* Coordenadas (para debug) */}
        <div className="bg-gray-100 rounded-lg p-4 text-xs text-gray-600">
          <p>
            📍 Coordenadas: {stop.lat.toFixed(6)}, {stop.lng.toFixed(6)}
          </p>
        </div>
      </div>
    </div>
  );
}
