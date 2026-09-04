import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Camera, X, AlertCircle, CheckCircle } from 'lucide-react';
import jsQR from 'jsqr';

export default function EscanerQRPage() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const handleStartScan = async () => {
    try {
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      setScanning(true);
      setError(null);
    } catch (err) {
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
      console.error('Camera error:', err);
    }
  };

  const handleStopScan = () => {
    setScanning(false);
    
    // Stop video stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Clear video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const scanQRCode = () => {
    if (!videoRef.current || !canvasRef.current || !scanning) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
      return;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data from canvas
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Try to decode QR code
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code) {
      
      handleQRCodeDetected(code.data);
    } else {
      // Continue scanning
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
    }
  };

  const handleQRCodeDetected = (data: string) => {
    
    
    // Stop scanning
    handleStopScan();
    
    try {
      // Try to parse the QR data
      // Expected formats:
      // - http://localhost:5174/transporte/paradas/123
      // - /transporte/paradas/123
      // - 123 (just the stop ID)
      
      let stopId: string | null = null;
      
      // Check if it's a URL
      if (data.includes('/transporte/paradas/')) {
        const match = data.match(/\/transporte\/paradas\/(\d+)/);
        if (match) {
          stopId = match[1];
        }
      } else if (data.includes('/parada/')) {
        // Legacy format
        const match = data.match(/\/parada\/(\d+)/);
        if (match) {
          stopId = match[1];
        }
      } else if (/^\d+$/.test(data)) {
        // Just a number
        stopId = data;
      }
      
      if (stopId) {
        setSuccess(`Parada ${stopId} detectada`);
        setTimeout(() => {
          navigate(`/transporte/paradas/${stopId}`);
        }, 500);
      } else {
        setError('Código QR no válido. Debe ser un código de parada.');
        setScanning(false);
      }
    } catch (err) {
      console.error('Error processing QR code:', err);
      setError('Error al procesar el código QR');
      setScanning(false);
    }
  };

  // Start scanning when video is ready
  useEffect(() => {
    if (scanning && videoRef.current) {
      const video = videoRef.current;
      
      const handleLoadedMetadata = () => {
        animationFrameRef.current = requestAnimationFrame(scanQRCode);
      };
      
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [scanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handleStopScan();
    };
  }, []);

  const handleManualInput = () => {
    const code = prompt('Ingresá el código de la parada:');
    if (code) {
      navigate(`/transporte/paradas/${code}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-6 px-4">
        <div className="container mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Escanear QR</h1>
            <button
              onClick={() => navigate('/moverse')}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-white/90">
            Escaneá el código QR de la parada para ver información en tiempo real
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {!scanning ? (
          <div className="space-y-4">
            {/* Scanner Card */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-100 rounded-full mb-6">
                  <ScanLine size={48} className="text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Escaneá un código QR
                </h2>
                <p className="text-gray-600 mb-6">
                  Cada parada de bus tiene un código QR único con información en tiempo real
                </p>
                <button
                  onClick={handleStartScan}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-lg"
                >
                  <Camera size={24} />
                  <span>Abrir Cámara</span>
                </button>
              </div>
            </div>

            {/* Success Alert */}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
                <div className="text-sm text-green-800">
                  <p className="font-medium">{success}</p>
                </div>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-1">Error al acceder a la cámara</p>
                  <p>{error}</p>
                </div>
              </div>
            )}

            {/* Manual Input */}
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-3">
                ¿No podés escanear?
              </h3>
              <button
                onClick={handleManualInput}
                className="w-full px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-blue-600 hover:text-blue-600 font-medium"
              >
                Ingresar código manualmente
              </button>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3">
                ¿Cómo funciona?
              </h3>
              <ol className="space-y-2 text-sm text-blue-800">
                <li className="flex gap-2">
                  <span className="font-semibold">1.</span>
                  <span>Buscá el código QR en la parada de bus</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold">2.</span>
                  <span>Escanealo con tu cámara</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold">3.</span>
                  <span>Verás los horarios en tiempo real y las líneas que pasan por esa parada</span>
                </li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Scanner View */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="aspect-square bg-gray-900 relative">
                {/* Video element (hidden, used for capture) */}
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  autoPlay
                />
                
                {/* Hidden canvas for QR detection */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Scanner frame overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-64 h-64 border-4 border-blue-500 rounded-xl relative">
                    {/* Scanning animation */}
                    <div className="absolute inset-0 border-t-4 border-blue-400 animate-pulse"></div>
                  </div>
                </div>

                {/* Instructions overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6 text-center">
                  <p className="text-white text-lg font-medium">
                    Apuntá la cámara al código QR
                  </p>
                </div>
              </div>

              <div className="p-4 text-center">
                <button
                  onClick={handleStopScan}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
