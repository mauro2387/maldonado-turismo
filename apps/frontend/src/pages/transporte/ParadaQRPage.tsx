import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download, Share2, ArrowLeft, Printer } from 'lucide-react';
import QRCode from 'react-qr-code';
import { BusStop, transportService } from '@services/transportService';
import { ErrorState, SkeletonList } from '@components/ui/States';
import { operatorNames } from '@lib/operators';
import { formatStopName } from '@lib/stopNames';

/**
 * El QR de una parada, para imprimir y pegarlo en el refugio.
 *
 * No es una pantalla de uso público: la usa quien produce las calcomanías. Por
 * eso lo único grande de la pantalla es el código, y lo demás son las tres
 * acciones que hacen falta para sacarlo de acá —bajarlo, compartirlo,
 * imprimirlo—.
 *
 * El código lleva la URL de la ficha de la parada, así que la cámara de
 * cualquier teléfono lo abre sin tener la app instalada.
 */

export default function ParadaQRPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [stop, setStop] = useState<BusStop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Confirmación dentro de la interfaz, no un `alert()` del navegador: bloquea
   * la pantalla y se ve distinto en cada sistema operativo.
   */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    transportService
      .getStopById(id)
      .then((data) => {
        if (!cancelled) setStop(data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? 'No pudimos traer esta parada');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const download = () => {
    const svg = document.getElementById('qr-code');
    if (!svg) return;

    const source = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const image = new Image();

    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      context?.drawImage(image, 0, 0);

      const link = document.createElement('a');
      link.download = `parada-${stop?.code ?? id}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    // `btoa` sólo acepta latin-1 y el SVG puede traer acentos en el nombre.
    image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(source)))}`;
  };

  const share = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: `Parada ${stop?.name ?? id}`, url });
        return;
      } catch {
        // Cancelar el diálogo del sistema no es un error que haya que contar.
        return;
      }
    }

    await navigator.clipboard.writeText(url);
    setNotice('Enlace copiado');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (error || !stop) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <ErrorState
          title="No encontramos esta parada"
          message={error ?? 'Puede que ese número ya no esté en servicio.'}
          onRetry={() => navigate('/moverse')}
          retryLabel="Ver los ómnibus que andan ahora"
        />
      </div>
    );
  }

  const qrValue = `${window.location.origin}/transporte/paradas/${id}`;

  return (
    <div className="min-h-[calc(100dvh-4.25rem)] bg-sand-100">
      <header className="flex items-center gap-3 bg-ink-900 px-4 py-3 text-white">
        <button
          onClick={() => navigate(`/transporte/paradas/${id}`)}
          aria-label="Volver a la parada"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{formatStopName(stop.name)}</span>
          <span className="block truncate text-xs text-ink-300">
            Código QR para el refugio
          </span>
        </span>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4">
        <div className="card text-center">
          <p className="section-label">Parada {stop.code}</p>
          <h1 className="mt-1 text-lg font-extrabold tracking-tight text-ink-900">
            {formatStopName(stop.name)}
          </h1>
          {stop.operators && stop.operators.length > 0 && (
            <p className="mt-0.5 text-data text-ink-400">{operatorNames(stop.operators)}</p>
          )}

          {/* El marco blanco es parte del código: sin margen alrededor, muchos
              lectores no lo enganchan. */}
          <div className="mt-4 flex justify-center">
            <div className="rounded-card border border-sand-200 bg-white p-5">
              <QRCode id="qr-code" value={qrValue} size={224} level="H" fgColor="#0B1F33" />
            </div>
          </div>

          <p className="mx-auto mt-4 max-w-xs text-data text-ink-500">
            Apuntándole la cámara se abre esta parada con los ómnibus que vienen, sin instalar
            nada.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button onClick={download} className="btn btn-secondary flex-col gap-1 text-xs">
              <Download className="h-4 w-4" strokeWidth={2} />
              Bajar
            </button>
            <button onClick={share} className="btn btn-secondary flex-col gap-1 text-xs">
              <Share2 className="h-4 w-4" strokeWidth={2} />
              Compartir
            </button>
            <button
              onClick={() => window.print()}
              className="btn btn-secondary flex-col gap-1 text-xs"
            >
              <Printer className="h-4 w-4" strokeWidth={2} />
              Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Al imprimir queda sólo el código: el resto de la pantalla no va a la
          calcomanía. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #qr-code, #qr-code * { visibility: visible; }
          #qr-code {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>

      {notice && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-float md:bottom-8"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
