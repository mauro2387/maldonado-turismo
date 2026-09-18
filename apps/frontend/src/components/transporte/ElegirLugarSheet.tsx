import { useEffect, useState } from 'react';
import { Briefcase, Bus, Home, LocateFixed, MapPin, MapPinned, Search, Star, Trash2, X } from 'lucide-react';
import { destinationsService, Destination } from '@services/destinationsService';
import { DestinoEnMapa } from '@components/transporte/DestinoEnMapa';
import { SheetGrab } from '@components/ui/SheetGrab';
import { useGeolocation } from '@hooks/useGeolocation';
import { Lugar, idDePunto, useLoTuyoStore } from '@store/loTuyoStore';
import { formatDistance } from '@lib/geo';
import { formatStopName } from '@lib/stopNames';

/**
 * "¿Dónde queda tu casa?"
 *
 * Es el planificador sin la parte de planificar: el mismo buscador contra el
 * mismo catálogo, y el mismo mapa con el pin en el centro para lo que no tiene
 * nombre —que para una casa es casi siempre—. Se usa para poner casa y
 * trabajo, que son los dos destinos que no se pueden escribir: "casa" no está
 * en ningún catálogo.
 *
 * No se reusa la pantalla del planificador con un modo "guardar" porque ahí
 * elegir un destino dispara una búsqueda de viaje desde donde uno está, y
 * quien está configurando su casa desde el sillón de su casa recibiría un
 * viaje de cero minutos. Acá elegir guarda y cierra.
 *
 * También sirve para elegir **desde dónde** en el planificador: ahí se
 * ofrece volver a "tu ubicación" (`alternativa`) y los atajos de lo tuyo
 * (`conAtajos`), porque "desde casa" es el origen más pedido después de
 * donde uno está.
 */

/** Lo que se espera después de la última tecla antes de salir a buscar. */
const SEARCH_DEBOUNCE_MS = 250;

export function ElegirLugarSheet({
  titulo,
  actual,
  onPick,
  onRemove,
  onClose,
  alternativa,
  conAtajos = false,
}: {
  /** "Tu casa", "Tu trabajo". */
  titulo: string;
  /** Lo que hay guardado ahora, para poder quitarlo. */
  actual: Lugar | null;
  onPick: (lugar: Lugar) => void;
  onRemove?: () => void;
  onClose: () => void;
  /** Una opción que no es un lugar: "usar tu ubicación". */
  alternativa?: { label: string; onPick: () => void };
  /** Ofrecer casa, trabajo y tus lugares como atajos. */
  conAtajos?: boolean;
}) {
  const { coords } = useGeolocation(false);
  const loTuyo = useLoTuyoStore();
  const atajos = conAtajos
    ? [
        ...(loTuyo.casa ? [{ icon: Home, label: 'Casa', lugar: loTuyo.casa }] : []),
        ...(loTuyo.trabajo ? [{ icon: Briefcase, label: 'Trabajo', lugar: loTuyo.trabajo }] : []),
        ...loTuyo.lugares.map((lugar) => ({ icon: Star, label: lugar.name, lugar })),
      ]
    : [];
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Destination[]>([]);
  const [pickingOnMap, setPickingOnMap] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      destinationsService
        .search(term, coords)
        .then((results) => {
          if (!cancelled) setSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, coords.lat, coords.lng]);

  if (pickingOnMap) {
    return (
      <DestinoEnMapa
        center={actual ?? coords}
        titulo={`Marcá dónde queda ${titulo.toLowerCase()}`}
        etiqueta={titulo}
        confirmar="Guardar acá"
        onCancel={() => setPickingOnMap(false)}
        onConfirm={(point) => {
          onPick({
            id: idDePunto(point.lat, point.lng),
            name: point.label,
            lat: point.lat,
            lng: point.lng,
          });
        }}
      />
    );
  }

  return (
    <>
      <button
        aria-label="Cerrar"
        onClick={onClose}
        className="fixed inset-0 z-[555] animate-fade-in bg-ink-950/40"
      />
      <div className="sheet fixed inset-x-0 bottom-0 z-[560] max-h-[85%] animate-sheet-up overflow-y-auto px-4 pb-6 pt-2">
        <SheetGrab onDismiss={onClose} />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold tracking-tight text-ink-900">{titulo}</h2>
            <p className="mt-0.5 text-xs text-ink-400">
              {actual ? `Ahora: ${actual.name}` : 'Buscá la dirección o marcala en el mapa.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex-none p-1">
            <X className="h-4 w-4 text-ink-400" strokeWidth={2} />
          </button>
        </div>

        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={2}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Una calle, un barrio, una parada"
            aria-label={`Buscar ${titulo.toLowerCase()}`}
            autoFocus
            className="input pl-10 font-semibold"
          />
        </div>

        <button
          onClick={() => setPickingOnMap(true)}
          className="btn btn-secondary mt-2 w-full gap-1.5"
        >
          <MapPinned className="h-4 w-4" strokeWidth={2} />
          Marcalo en el mapa
        </button>

        {alternativa && (
          <button onClick={alternativa.onPick} className="btn btn-secondary mt-2 w-full gap-1.5">
            <LocateFixed className="h-4 w-4" strokeWidth={2} />
            {alternativa.label}
          </button>
        )}

        {atajos.length > 0 && (
          <div className="chip-row mt-3">
            {atajos.map(({ icon: Icon, label, lugar }) => (
              <button key={lugar.id} onClick={() => onPick(lugar)} className="chip">
                <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                {label}
              </button>
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <ul className="mt-2 divide-y divide-sand-200">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  onClick={() =>
                    onPick({
                      id: suggestion.id,
                      name:
                        suggestion.source === 'parada'
                          ? formatStopName(suggestion.name)
                          : suggestion.name,
                      lat: suggestion.lat,
                      lng: suggestion.lng,
                    })
                  }
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  {suggestion.source === 'parada' ? (
                    <Bus className="h-4 w-4 flex-none text-ink-300" strokeWidth={2} />
                  ) : (
                    <MapPin className="h-4 w-4 flex-none text-ink-300" strokeWidth={2} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-data font-bold text-ink-900">
                      {suggestion.source === 'parada'
                        ? formatStopName(suggestion.name)
                        : suggestion.name}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      <span className="capitalize">{suggestion.kind}</span>
                      {suggestion.locality ? ` · ${suggestion.locality}` : ''}
                      {suggestion.distanceM !== undefined
                        ? ` · a ${formatDistance(suggestion.distanceM)}`
                        : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {actual && onRemove && (
          <button
            onClick={onRemove}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-crit"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            Quitar {titulo.toLowerCase()}
          </button>
        )}

        {/* Sólo cuando lo elegido se guarda (casa, trabajo): un origen de un
            viaje no se guarda en ningún lado. */}
        {!alternativa && (
          <p className="mt-4 text-xs text-ink-300">Se guarda en este teléfono, no en una cuenta.</p>
        )}
      </div>
    </>
  );
}

export default ElegirLugarSheet;
