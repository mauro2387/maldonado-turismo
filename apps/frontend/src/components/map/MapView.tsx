import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Create custom icon function with emoji
const createCustomIcon = (emoji: string, color: string) => {
  return L.divIcon({
    html: `
      <div style="
        position: relative;
        width: 35px;
        height: 45px;
      ">
        <div style="
          width: 35px;
          height: 35px;
          background: ${color};
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <span style="
            font-size: 18px;
            transform: rotate(45deg);
            display: block;
          ">${emoji}</span>
        </div>
      </div>
    `,
    className: 'custom-marker-icon',
    iconSize: [35, 45],
    iconAnchor: [17, 45],
    popupAnchor: [0, -45],
  });
};

// Category-specific icons
const customIcons: Record<string, L.DivIcon> = {
  'Playa': createCustomIcon('🏖️', '#3b82f6'),
  'Museo': createCustomIcon('🏛️', '#8b5cf6'),
  'Parque': createCustomIcon('🌳', '#22c55e'),
  'Restaurante': createCustomIcon('🍽️', '#f97316'),
  'Hotel': createCustomIcon('🏨', '#ef4444'),
  'Música': createCustomIcon('🎵', '#ec4899'),
  'Teatro': createCustomIcon('🎭', '#a855f7'),
  'Deportes': createCustomIcon('⚽', '#10b981'),
  'Arte': createCustomIcon('🎨', '#f59e0b'),
  'Otro': createCustomIcon('📍', '#6b7280'),
};

export interface MapLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  description?: string;
  image?: string;
}

interface MapViewProps {
  center?: [number, number];
  zoom?: number;
  locations?: MapLocation[];
  onLocationClick?: (location: MapLocation) => void;
  height?: string;
  showControls?: boolean;
  enableGeolocation?: boolean;
}

export function MapView({
  center = [
    Number(import.meta.env.VITE_MAP_CENTER_LAT) || -34.9681,
    Number(import.meta.env.VITE_MAP_CENTER_LNG) || -54.9512,
  ],
  zoom = Number(import.meta.env.VITE_MAP_DEFAULT_ZOOM) || 13,
  locations = [],
  onLocationClick,
  height = '100%',
  showControls = true,
  enableGeolocation = true,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current) {
      console.error('Map container ref not available');
      return;
    }
    
    if (mapRef.current) {
      console.log('Map already initialized, skipping');
      return;
    }

    try {
      console.log('Initializing map at center:', center, 'with zoom:', zoom);

      // Create map
      const map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: showControls,
      });

      console.log('Map created successfully');

      // Add tile layer (OpenStreetMap)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      console.log('Tile layer added');

      // Add geolocation control if enabled - misma altura que el buscador
      if (enableGeolocation) {
        const GeolocationControl = L.Control.extend({
          onAdd: function () {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-geolocation');
            div.innerHTML = `
              <a href="#" title="Mi ubicación" style="width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-size: 18px; background: white;">
                📍
              </a>
            `;
            div.onclick = (e) => {
              e.preventDefault();
              if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const { latitude, longitude } = position.coords;
                    map.setView([latitude, longitude], 15);
                    L.marker([latitude, longitude])
                      .addTo(map)
                      .bindPopup('Tu ubicación actual')
                      .openPopup();
                  },
                  (error) => {
                    console.error('Error getting location:', error);
                    alert('No se pudo obtener tu ubicación');
                  }
                );
              }
            };
            return div;
          },
        });
        
        new GeolocationControl({ position: 'topright' }).addTo(map);
      }

      mapRef.current = map;

      // Force map to recalculate size after a brief delay
      setTimeout(() => {
        map.invalidateSize();
        console.log('Map size invalidated');
      }, 100);

    } catch (error) {
      console.error('Error initializing map:', error);
    }

    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [center, zoom, showControls, enableGeolocation]);

  // Update markers when locations change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add new markers
    locations.forEach((location) => {
      // Get custom icon based on category, default to 'Otro' if not found
      const icon = location.category && customIcons[location.category] 
        ? customIcons[location.category] 
        : customIcons['Otro'];
      
      const marker = L.marker([location.lat, location.lng], { icon });

      // Create popup content
      const popupContent = `
        <div style="min-width: 200px;">
          ${location.image ? `<img src="${location.image}" alt="${location.name}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;" />` : ''}
          <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">${location.name}</h3>
          ${location.category ? `<span style="display: inline-block; background: #3b82f6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-bottom: 8px;">${location.category}</span>` : ''}
          ${location.description ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${location.description}</p>` : ''}
          <a href="/place/${location.id}" style="display: inline-block; margin-top: 8px; color: #3b82f6; text-decoration: none; font-weight: 500;">Ver detalles →</a>
        </div>
      `;

      marker.bindPopup(popupContent);

      if (onLocationClick) {
        marker.on('click', () => onLocationClick(location));
      }

      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });

    // Fit bounds only on initial load when there are locations
    if (locations.length > 0 && isInitialLoadRef.current) {
      const bounds = L.latLngBounds(locations.map((loc) => [loc.lat, loc.lng]));
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      isInitialLoadRef.current = false;
    }
  }, [locations, onLocationClick]);

  return (
    <div
      ref={containerRef}
      style={{ 
        height, 
        width: '100%',
        minHeight: '400px',
        position: 'relative',
        zIndex: 0
      }}
      className="rounded-lg overflow-hidden shadow-lg"
    />
  );
}
