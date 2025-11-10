import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import toast from 'react-hot-toast';

// Fix para los iconos de Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Iconos personalizados con símbolos específicos para cada categoría
const createCustomIcon = (emoji: string, color: string) => {
  const iconHtml = `
    <div style="
      background-color: ${color};
      width: 35px;
      height: 35px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 3px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <span style="
        font-size: 20px;
        transform: rotate(45deg);
        display: block;
      ">${emoji}</span>
    </div>
  `;
  
  return L.divIcon({
    html: iconHtml,
    className: 'custom-marker',
    iconSize: [35, 45],
    iconAnchor: [17, 45],
    popupAnchor: [0, -45]
  });
};

const customIcons: Record<string, L.DivIcon> = {
  // Categorías de Lugares
  Playa: createCustomIcon('🏖️', '#3b82f6'),      // Azul - Playa
  Museo: createCustomIcon('🏛️', '#8b5cf6'),      // Púrpura - Museo
  Parque: createCustomIcon('🌳', '#22c55e'),      // Verde - Parque
  Restaurante: createCustomIcon('🍽️', '#f97316'), // Naranja - Restaurante
  Hotel: createCustomIcon('🏨', '#ef4444'),       // Rojo - Hotel
  
  // Categorías de Eventos
  Música: createCustomIcon('🎵', '#ec4899'),      // Rosa - Música
  Teatro: createCustomIcon('🎭', '#a855f7'),      // Púrpura - Teatro
  Deportes: createCustomIcon('⚽', '#10b981'),    // Verde - Deportes
  Arte: createCustomIcon('🎨', '#f59e0b'),        // Amarillo - Arte
  Gastronomía: createCustomIcon('🍽️', '#f97316'), // Naranja - Gastronomía
  
  // Por defecto
  Otro: createCustomIcon('📍', '#6b7280'),        // Gris - Otro
};

interface MapPickerProps {
  lat: number;
  lng: number;
  address: string;
  category?: string;
  onLocationChange: (lat: number, lng: number) => void;
  onAddressChange?: (address: string) => void;
}

function LocationMarker({ position, category, onPositionChange }: any) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng);
    },
  });

  // Solo usar icono personalizado si hay categoría válida
  const icon = category && customIcons[category] ? customIcons[category] : null;
  
  return position ? (
    icon ? <Marker position={position} icon={icon} /> : <Marker position={position} />
  ) : null;
}

export default function MapPicker({ 
  lat, 
  lng,
  category,
  onLocationChange,
  onAddressChange 
}: MapPickerProps) {
  const [position, setPosition] = useState<[number, number]>([
    typeof lat === 'number' && !isNaN(lat) ? lat : -34.9, 
    typeof lng === 'number' && !isNaN(lng) ? lng : -54.95
  ]);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      setPosition([lat, lng]);
    }
  }, [lat, lng]);

  const handlePositionChange = async (latlng: any) => {
    const newLat = latlng.lat;
    const newLng = latlng.lng;
    
    setPosition([newLat, newLng]);
    setValidating(true);

    try {
      // Geocodificación inversa con Nominatim (OpenStreetMap)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&zoom=18&addressdetails=1&accept-language=es`
      );
      const data = await response.json();
      
      if (data && data.address) {
        // Construir dirección legible
        const addr = data.address;
        const parts = [
          addr.road || addr.pedestrian || addr.footway,
          addr.house_number,
          addr.suburb || addr.neighbourhood || addr.quarter,
          addr.city || addr.town || addr.village || 'Maldonado',
        ].filter(Boolean);
        
        const formattedAddress = parts.join(', ');
        
        // Auto-completar la dirección si hay callback
        if (onAddressChange) {
          onAddressChange(formattedAddress);
          toast.success('Dirección cargada automáticamente');
        }
        
        // Siempre actualizar coordenadas
        onLocationChange(newLat, newLng);
      } else {
        // Si no hay dirección, solo actualizar coordenadas
        onLocationChange(newLat, newLng);
        if (onAddressChange) {
          toast('No se encontró dirección para esta ubicación', { icon: '⚠️' });
        }
      }
    } catch (error) {
      console.error('Error obteniendo dirección:', error);
      // Si falla la API, permitir el cambio de coordenadas de todos modos
      onLocationChange(newLat, newLng);
      if (onAddressChange) {
        toast('Error al cargar dirección automáticamente', { icon: '⚠️' });
      }
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="relative">
      <MapContainer
        center={position}
        zoom={15}
        style={{ height: '400px', width: '100%', borderRadius: '8px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker 
          position={position} 
          category={category}
          onPositionChange={handlePositionChange} 
        />
      </MapContainer>
      
      {validating && (
        <div className="absolute top-2 right-2 bg-white px-3 py-2 rounded-lg shadow-lg z-[1000] flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
          <span className="text-sm">Cargando dirección...</span>
        </div>
      )}
      
      <div className="mt-2 text-sm text-gray-600">
        <p>📍 Latitud: {typeof position[0] === 'number' ? position[0].toFixed(6) : 'N/A'}, Longitud: {typeof position[1] === 'number' ? position[1].toFixed(6) : 'N/A'}</p>
        <p className="text-xs text-gray-500 mt-1">
          💡 Haz clic en el mapa para seleccionar la ubicación. 
          {onAddressChange && ' La dirección se cargará automáticamente.'}
        </p>
      </div>
    </div>
  );
}
