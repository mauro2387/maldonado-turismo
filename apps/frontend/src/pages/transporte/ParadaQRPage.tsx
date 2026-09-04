import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QrCode, Download, Share2, ArrowLeft, Loader2 } from 'lucide-react';
import QRCode from 'react-qr-code';
import { BusStop } from '@services/transportService';
import Breadcrumbs from '@components/Breadcrumbs';
import { formatStopName } from '@lib/stopNames';

export default function ParadaQRPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stop, setStop] = useState<BusStop | null>(null);
  const [loading, setLoading] = useState(true);

  // Confirmación de "enlace copiado" dentro de la interfaz. Antes era un
  // alert() del navegador, que bloquea la pantalla y se ve distinto en cada
  // sistema operativo.
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);


  useEffect(() => {
    const fetchStop = async () => {
      try {
        const { transportService } = await import('@services/transportService');
        const stopData = await transportService.getStopById(id!);
        setStop(stopData);
      } catch (error) {
        console.error('Error fetching stop:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchStop();
    }
  }, [id]);

  const handleDownload = () => {
    const svg = document.getElementById('qr-code');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');

      const downloadLink = document.createElement('a');
      downloadLink.download = `parada-${stop?.code || id}-qr.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  const handleShare = async () => {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Parada ${stop?.name || id}`,
          text: `Código QR de la parada ${stop?.name || id}`,
          url: url,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // Fallback: copiar al portapapeles
      navigator.clipboard.writeText(url);
      setCopied(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  if (!stop) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <QrCode className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600 mb-4">No se encontró la parada</p>
          <button onClick={() => navigate('/moverse')} className="btn btn-primary">
            Volver al transporte
          </button>
        </div>
      </div>
    );
  }

  const qrValue = `${window.location.origin}/transporte/paradas/${id}`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="container mx-auto px-4 py-4">
          <Breadcrumbs
            items={[
              { label: 'Moverse', path: '/moverse' },
              { label: 'Paradas', path: '/moverse' },
              { label: formatStopName(stop.name), path: `/transporte/paradas/${id}` },
              { label: 'Código QR' },
            ]}
          />
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft size={20} />
            <span>Volver</span>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Código QR de Parada</h1>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* QR Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            {/* Stop Info */}
            <div className="text-center mb-8">
              <div className="inline-block bg-primary-100 text-primary-800 px-4 py-2 rounded-lg font-bold text-lg mb-3">
                {stop.code}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{formatStopName(stop.name)}</h2>
              <p className="text-gray-600">{stop.zone}</p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-8">
              <div className="bg-white p-6 rounded-xl shadow-inner border-4 border-gray-100">
                <QRCode
                  id="qr-code"
                  value={qrValue}
                  size={256}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                />
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <QrCode size={20} />
                ¿Cómo usar este QR?
              </h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Escanea el código con la cámara de tu teléfono</li>
                <li>Accede a horarios y tiempos de llegada en tiempo real</li>
                <li>Descarga el código para usarlo sin conexión</li>
                <li>Comparte con otros viajeros</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="flex-1 btn btn-primary flex items-center justify-center gap-2"
              >
                <Download size={20} />
                <span>Descargar</span>
              </button>
              <button
                onClick={handleShare}
                className="flex-1 btn btn-secondary flex items-center justify-center gap-2"
              >
                <Share2 size={20} />
                <span>Compartir</span>
              </button>
            </div>
          </div>

          {/* Stop Details */}
          {stop.routes && stop.routes.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
              <h3 className="font-semibold text-gray-900 mb-4">Líneas que pasan por esta parada</h3>
              <div className="flex gap-2 flex-wrap">
                {stop.routes.map((routeId: string) => (
                  <span
                    key={routeId}
                    className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                  >
                    {routeId}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Print Option */}
          <div className="bg-gray-100 rounded-xl p-6 mt-6 text-center">
            <p className="text-gray-700 mb-4">
              💡 <strong>Tip:</strong> Imprime este QR para colocarlo en la parada física
            </p>
            <button
              onClick={() => window.print()}
              className="btn btn-secondary"
            >
              Imprimir código QR
            </button>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #qr-code, #qr-code * {
            visibility: visible;
          }
          #qr-code {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>

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
