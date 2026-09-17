import { Briefcase, Check, Home, Star, X } from 'lucide-react';
import { SheetGrab } from '@components/ui/SheetGrab';
import { Lugar, useLoTuyoStore } from '@store/loTuyoStore';

/**
 * "Guardar este destino como…"
 *
 * Tres opciones y no una estrella que guarda a secas, porque un destino
 * puede ser tres cosas distintas y la diferencia importa en Moverse: casa y
 * trabajo tienen un chip fijo con su ícono, y los demás lugares van con
 * estrella. Si la estrella guardara "en tus lugares" nomás, nadie pondría su
 * casa —que es el viaje que más se hace— sin ir a buscar dónde se configura.
 *
 * Cada fila dice lo que hay ahora: si ya tenés una casa guardada, elegir
 * "Casa" acá la **reemplaza**, y eso se avisa en la fila antes de tocar.
 */
export function GuardarDestinoSheet({ lugar, onClose }: { lugar: Lugar; onClose: () => void }) {
  const { casa, trabajo, lugares, setCasa, setTrabajo, toggleLugar } = useLoTuyoStore();

  const esCasa = casa?.id === lugar.id;
  const esTrabajo = trabajo?.id === lugar.id;
  const esLugar = lugares.some((otro) => otro.id === lugar.id);

  const opciones = [
    {
      key: 'casa',
      icon: Home,
      titulo: 'Casa',
      activa: esCasa,
      detalle: esCasa
        ? 'Es tu casa'
        : casa
          ? `Reemplaza a ${casa.name}`
          : 'Aparece como "A casa" en Moverse',
      onToggle: () => setCasa(esCasa ? null : lugar),
    },
    {
      key: 'trabajo',
      icon: Briefcase,
      titulo: 'Trabajo',
      activa: esTrabajo,
      detalle: esTrabajo
        ? 'Es tu trabajo'
        : trabajo
          ? `Reemplaza a ${trabajo.name}`
          : 'Aparece como "Al trabajo" en Moverse',
      onToggle: () => setTrabajo(esTrabajo ? null : lugar),
    },
    {
      key: 'lugar',
      icon: Star,
      titulo: 'Tus lugares',
      activa: esLugar,
      detalle: esLugar ? 'Está en tus lugares' : 'Un chip con su nombre en Moverse',
      onToggle: () => toggleLugar(lugar),
    },
  ];

  return (
    <>
      <button
        aria-label="Cerrar"
        onClick={onClose}
        className="fixed inset-0 z-[555] animate-fade-in bg-ink-950/40"
      />
      <div className="sheet fixed inset-x-0 bottom-0 z-[560] animate-sheet-up px-4 pb-6 pt-2">
        <SheetGrab onDismiss={onClose} />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold tracking-tight text-ink-900">Guardar</h2>
            <p className="mt-0.5 truncate text-xs text-ink-400">{lugar.name}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex-none p-1">
            <X className="h-4 w-4 text-ink-400" strokeWidth={2} />
          </button>
        </div>

        <ul className="mt-3 divide-y divide-sand-200">
          {opciones.map(({ key, icon: Icon, titulo, activa, detalle, onToggle }) => (
            <li key={key}>
              <button
                onClick={onToggle}
                aria-pressed={activa}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${
                    activa ? 'bg-ink-900 text-white' : 'bg-sand-100 text-ink-600'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-data font-bold text-ink-900">{titulo}</span>
                  <span className="block truncate text-xs text-ink-400">{detalle}</span>
                </span>
                {activa && <Check className="h-4 w-4 flex-none text-coral-500" strokeWidth={2.5} />}
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-ink-300">Se guarda en este teléfono, no en una cuenta.</p>
      </div>
    </>
  );
}

export default GuardarDestinoSheet;
