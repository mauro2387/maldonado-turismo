import { useState, useRef, useEffect } from 'react';
import { MapPin, Navigation, Search, X } from 'lucide-react';
import { BusStop } from '@services/transportService';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string, stop?: BusStop) => void;
  stops: BusStop[];
  placeholder: string;
  label: string;
  icon?: 'origin' | 'destination';
  showCurrentLocation?: boolean;
  onUseCurrentLocation?: () => void;
  usingCurrentLocation?: boolean;
}

export default function LocationAutocomplete({
  value,
  onChange,
  stops,
  placeholder,
  label,
  icon = 'origin',
  showCurrentLocation = false,
  onUseCurrentLocation,
  usingCurrentLocation = false,
}: LocationAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredStops, setFilteredStops] = useState<BusStop[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const iconColor = icon === 'origin' ? 'text-green-500' : 'text-red-500';

  useEffect(() => {
    if (value.length >= 2) {
      const filtered = stops.filter((stop) => {
        const searchValue = value.toLowerCase();
        return (
          stop.name.toLowerCase().includes(searchValue) ||
          stop.zone.toLowerCase().includes(searchValue) ||
          stop.code.toLowerCase().includes(searchValue) ||
          stop.address?.toLowerCase().includes(searchValue)
        );
      });
      setFilteredStops(filtered.slice(0, 10)); // Limitar a 10 resultados
      setShowSuggestions(true);
    } else {
      setFilteredStops([]);
      setShowSuggestions(false);
    }
    setHighlightedIndex(-1);
  }, [value, stops]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleSelectStop = (stop: BusStop) => {
    onChange(stop.name, stop);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    onChange('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filteredStops.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < filteredStops.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredStops.length) {
          handleSelectStop(filteredStops[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      
      <div className="relative">
        <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconColor}`} size={20} />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onFocus={() => {
            if (value.length >= 2 && filteredStops.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={usingCurrentLocation}
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {value && !usingCurrentLocation && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {showCurrentLocation && (
        <button
          onClick={onUseCurrentLocation}
          disabled={usingCurrentLocation}
          className="mt-2 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
        >
          <Navigation size={14} />
          {usingCurrentLocation ? 'Obteniendo ubicación...' : 'Usar mi ubicación actual'}
        </button>
      )}

      {/* Suggestions Dropdown */}
      {showSuggestions && filteredStops.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {filteredStops.map((stop, index) => (
            <button
              key={stop.id}
              onClick={() => handleSelectStop(stop)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors ${
                index === highlightedIndex ? 'bg-primary-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <MapPin className={iconColor} size={18} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{stop.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {stop.zone} • Código: {stop.code}
                    {stop.address && ` • ${stop.address}`}
                  </p>
                  {stop.routes && stop.routes.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      Líneas: {stop.routes.slice(0, 5).join(', ')}
                      {stop.routes.length > 5 && ` +${stop.routes.length - 5}`}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {showSuggestions && value.length >= 2 && filteredStops.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
          <Search size={24} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm">No se encontraron paradas</p>
          <p className="text-xs mt-1">Intenta con otro nombre o zona</p>
        </div>
      )}
    </div>
  );
}
