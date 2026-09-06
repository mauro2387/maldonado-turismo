import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Home, Search, ArrowLeft, Compass } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();

  const suggestedLinks = [
    { to: '/', icon: Home, label: 'Inicio', description: 'Explora Maldonado' },
    { to: '/que-hacer?ver=lugares', icon: MapPin, label: 'Lugares', description: 'Playas, museos y paseos' },
    { to: '/que-hacer', icon: Compass, label: 'Eventos', description: 'Qué hacer hoy' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header con botón volver */}
        <button
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-gray-600 hover:text-primary-600 transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Volver atrás</span>
        </button>

        <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center">
          <div className="w-full max-w-2xl text-center">
            {/* Ilustración SVG animada */}
            <div className="mb-8 animate-fade-in">
              <svg
                viewBox="0 0 400 300"
                className="mx-auto w-full max-w-md"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Cielo con gradiente */}
                <defs>
                  <linearGradient id="skyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                
                {/* Fondo */}
                <rect width="400" height="300" fill="url(#skyGradient)" />
                
                {/* Sol */}
                <circle cx="320" cy="60" r="30" fill="#fbbf24" opacity="0.8">
                  <animate
                    attributeName="r"
                    values="30;32;30"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </circle>
                
                {/* Montañas de fondo */}
                <path
                  d="M 0 200 Q 100 120 200 180 T 400 160 L 400 300 L 0 300 Z"
                  fill="#94a3b8"
                  opacity="0.3"
                />
                <path
                  d="M 0 220 Q 80 160 160 200 T 320 190 T 400 200 L 400 300 L 0 300 Z"
                  fill="#64748b"
                  opacity="0.4"
                />
                
                {/* Palmera */}
                <ellipse cx="100" cy="240" rx="8" ry="12" fill="#065f46" />
                <ellipse cx="95" cy="230" rx="20" ry="8" fill="#059669" />
                <ellipse cx="105" cy="230" rx="20" ry="8" fill="#059669" />
                <ellipse cx="100" cy="225" rx="18" ry="10" fill="#10b981" />
                
                {/* Señal de tránsito con 404 */}
                <g transform="translate(200, 140)">
                  <rect x="-50" y="-50" width="100" height="100" rx="8" fill="#ef4444" />
                  <rect x="-45" y="-45" width="90" height="90" rx="6" fill="#fef2f2" />
                  <text
                    x="0"
                    y="10"
                    fontSize="48"
                    fontWeight="bold"
                    fill="#dc2626"
                    textAnchor="middle"
                  >
                    404
                  </text>
                </g>
                
                {/* Poste */}
                <rect x="195" y="190" width="10" height="60" fill="#475569" />
                
                {/* Camino */}
                <path
                  d="M 0 250 Q 200 240 400 260 L 400 300 L 0 300 Z"
                  fill="#d97706"
                  opacity="0.3"
                />
                <path
                  d="M 50 260 L 60 260 M 120 258 L 130 258 M 190 256 L 200 256 M 260 257 L 270 257 M 330 259 L 340 259"
                  stroke="#fef3c7"
                  strokeWidth="2"
                  strokeDasharray="10,10"
                />
              </svg>
            </div>

            {/* Texto principal */}
            <h1 className="mb-4 text-6xl font-bold text-gray-900 sm:text-7xl lg:text-8xl">
              <span className="inline-block animate-bounce">4</span>
              <span className="inline-block animate-bounce delay-100">0</span>
              <span className="inline-block animate-bounce delay-200">4</span>
            </h1>
            
            <h2 className="mb-3 text-2xl font-semibold text-gray-800 sm:text-3xl">
              ¡Ups! Página no encontrada
            </h2>
            
            <p className="mb-8 text-lg text-gray-600 max-w-md mx-auto">
              Parece que te has perdido en tu aventura por Maldonado. 
              La página que buscas no existe o fue movida.
            </p>

            {/* Buscador rápido */}
            <div className="mb-10 mx-auto max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Buscar lugares, eventos..."
                  className="w-full rounded-full border border-gray-300 pl-10 pr-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value) {
                      navigate(`/search?q=${encodeURIComponent(e.currentTarget.value)}`);
                    }
                  }}
                />
              </div>
            </div>

            {/* Links sugeridos */}
            <div className="grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
              {suggestedLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="group card hover:shadow-md transition-all duration-200 hover:scale-105"
                >
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="rounded-full bg-primary-100 p-3 group-hover:bg-primary-600 transition-colors">
                      <link.icon 
                        className="text-primary-600 group-hover:text-white transition-colors" 
                        size={24} 
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{link.label}</p>
                      <p className="text-sm text-gray-500">{link.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Footer de ayuda */}
            <div className="mt-12 text-sm text-gray-500">
              <p>¿Necesitas ayuda? Contacta con nosotros:</p>
              <a 
                href="mailto:contacto@pulsarmoon.com" 
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                contacto@pulsarmoon.com
              </a>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        
        .delay-100 {
          animation-delay: 0.1s;
        }
        
        .delay-200 {
          animation-delay: 0.2s;
        }
      `}</style>
    </div>
  );
}
