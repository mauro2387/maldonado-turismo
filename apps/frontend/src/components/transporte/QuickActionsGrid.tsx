import { useNavigate } from 'react-router-dom';
import { Bus, Map, QrCode, Route as RouteIcon } from 'lucide-react';

export default function QuickActionsGrid() {
  const navigate = useNavigate();

  const actions = [
    {
      icon: Map,
      label: 'Mapa Interactivo',
      color: 'from-blue-500 to-blue-600',
      onClick: () => navigate('/mapa'),
    },
    {
      icon: Bus,
      label: 'Buses en Vivo',
      color: 'from-green-500 to-green-600',
      onClick: () => navigate('/transporte/mapa'),
    },
    {
      icon: QrCode,
      label: 'Escanear QR',
      color: 'from-purple-500 to-purple-600',
      onClick: () => navigate('/transporte/escaner'),
    },
    {
      icon: RouteIcon,
      label: 'Planificar Viaje',
      color: 'from-orange-500 to-orange-600',
      onClick: () => navigate('/transporte/planificador'),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          className={`flex flex-col items-center justify-center gap-2 p-4 bg-gradient-to-br ${action.color} text-white rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-105`}
        >
          <action.icon size={28} />
          <span className="text-sm font-semibold text-center">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
