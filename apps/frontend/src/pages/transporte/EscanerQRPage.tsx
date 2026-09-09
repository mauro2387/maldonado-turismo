import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Camera, ArrowLeft, Keyboard } from 'lucide-react';
import jsQR from 'jsqr';
import { ErrorState, InlineNotice } from '@components/ui/States';

/**
 * El escáner del QR de la parada.
 *
 * Esta pantalla se usa parado en el refugio, con una mano, y muchas veces de
 * noche: es el momento de menos paciencia de toda la app. Por eso contesta
 * rápido y ofrece una salida —tipear el número— para cuando la cámara no
 * arranca, la calcomanía está rayada o directamente no hay luz.
 *
 * El QR no consulta a ningún servidor: lleva la URL de la parada y lo único
 * que se hace acá es leer el número y navegar. Eso es lo que permite que
 * funcione con la conexión de un refugio.
 */

/**
 * De qué formas viene escrito el número de parada en los QR que hay pegados.
 *
 * Se imprimieron en tandas distintas y no todas dicen lo mismo: las viejas
 * llevan `/parada/123` y las nuevas `/transporte/paradas/123`. Las dos siguen
 * en la calle, así que las dos tienen que funcionar.
 */
function stopIdFromQr(data: string): string | null {
  const nueva = data.match(/\/transporte\/paradas\/(\d+)/);
  if (nueva) return nueva[1];

  const vieja = data.match(/\/parada\/(\d+)/);
  if (vieja) return vieja[1];

  // Un QR que sólo lleva el número, sin URL.
  if (/^\d+$/.test(data.trim())) return data.trim();

  return null;
}

export default function EscanerQRPage() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const startScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setScanning(true);
      setError(null);
    } catch {
      setError(
        'No pudimos abrir la cámara. Puede ser que el permiso esté denegado, o que otra app la esté usando.',
      );
    }
  };

  const stopScan = () => {
    setScanning(false);

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const context = canvas.getContext('2d');
    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
      frameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });

    if (!code) {
      frameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    stopScan();

    const stopId = stopIdFromQr(code.data);
    if (!stopId) {
      setError('Ese código no es de una parada. Fijate que sea el de la calcomanía del refugio.');
      return;
    }

    // Medio segundo de confirmación: sin eso la pantalla cambia sola y no
    // queda claro que el escaneo funcionó.
    setFound(stopId);
    setTimeout(() => navigate(`/transporte/paradas/${stopId}`), 500);
  };

  useEffect(() => {
    if (!scanning) return;
    const video = videoRef.current;
    if (!video) return;

    const onReady = () => {
      frameRef.current = requestAnimationFrame(scanFrame);
    };

    video.addEventListener('loadedmetadata', onReady);
    return () => video.removeEventListener('loadedmetadata', onReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  useEffect(() => stopScan, []);

  return (
    <div className="min-h-[calc(100dvh-4.25rem)] bg-sand-100">
      <header className="flex items-center gap-3 bg-ink-900 px-4 py-3 text-white">
        <button
          onClick={() => (scanning ? stopScan() : navigate('/moverse'))}
          aria-label="Volver"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Escanear el QR de la parada</span>
          <span className="block truncate text-xs text-ink-300">
            Para ver qué viene, sin buscarla en una lista
          </span>
        </span>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {scanning ? (
          <div className="overflow-hidden rounded-card bg-ink-900">
            <div className="relative aspect-square">
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                playsInline
                autoPlay
                muted
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* El marco: el encuadre es la única instrucción que se necesita. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-56 w-56 rounded-card border-4 border-coral-500 shadow-[0_0_0_9999px_rgba(11,31,51,.45)]" />
              </div>

              <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/80 to-transparent px-4 pb-4 pt-8 text-center text-sm font-bold text-white">
                Apuntá al código de la parada
              </p>
            </div>

            <div className="p-3">
              <button onClick={stopScan} className="btn btn-ghost w-full text-white">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="card text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sand-100">
                <ScanLine className="h-7 w-7 text-ink-900" strokeWidth={2} />
              </span>
              <h2 className="mt-3 text-base font-extrabold tracking-tight text-ink-900">
                Escaneá el código del refugio
              </h2>
              <p className="mx-auto mt-1 max-w-xs text-data text-ink-500">
                Cada parada tiene el suyo. Te lleva derecho a qué ómnibus viene y en cuánto.
              </p>
              <button onClick={startScan} className="btn btn-primary mt-4 w-full gap-2">
                <Camera className="h-4 w-4" strokeWidth={2.5} />
                Abrir la cámara
              </button>
            </div>

            {found && (
              <div className="mt-3">
                <InlineNotice tone="info" message={`Parada ${found} encontrada. Abriendo…`} />
              </div>
            )}

            {error && (
              <ErrorState
                title="No se pudo escanear"
                message={error}
                onRetry={startScan}
                className="mt-3"
              />
            )}

            {/* ---------- La salida cuando la cámara no es opción ----------
                Antes esto era un `prompt()` del navegador: una ventanita gris
                del sistema, sin teclado numérico y sin forma de corregir el
                número sin volver a empezar. */}
            <form
              className="card mt-3"
              onSubmit={(event) => {
                event.preventDefault();
                const value = manual.trim();
                if (/^\d+$/.test(value)) navigate(`/transporte/paradas/${value}`);
              }}
            >
              <h3 className="section-label">¿No podés escanear?</h3>
              <p className="mt-1 text-data text-ink-500">
                El número está impreso abajo del código, en la misma calcomanía.
              </p>
              <div className="mt-3 flex gap-2">
                <label className="sr-only" htmlFor="codigo-parada">
                  Número de parada
                </label>
                <input
                  id="codigo-parada"
                  className="input flex-1"
                  value={manual}
                  onChange={(event) => setManual(event.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Número de la parada"
                />
                <button
                  type="submit"
                  disabled={!manual.trim()}
                  className="btn btn-secondary flex-none gap-1.5 disabled:opacity-40"
                >
                  <Keyboard className="h-4 w-4" strokeWidth={2.5} />
                  Ir
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
