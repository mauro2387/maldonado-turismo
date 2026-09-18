import { Accessibility } from 'lucide-react';
import { usePreferenciasStore } from '@store/preferenciasStore';

/**
 * El chip de "sólo con rampa".
 *
 * Es el mismo en todas las pantallas que listan ómnibus, y toca la misma
 * preferencia: prenderlo en Moverse lo deja prendido en el planificador y en
 * la ficha de la parada. Ver `preferenciasStore`.
 */
export function SoloAccesiblesChip({ className }: { className?: string }) {
  const soloAccesibles = usePreferenciasStore((estado) => estado.soloAccesibles);
  const setSoloAccesibles = usePreferenciasStore((estado) => estado.setSoloAccesibles);

  return (
    <button
      type="button"
      onClick={() => setSoloAccesibles(!soloAccesibles)}
      aria-pressed={soloAccesibles}
      className={`chip ${soloAccesibles ? 'chip-active' : ''} ${className ?? ''}`}
    >
      <Accessibility className="h-3.5 w-3.5" strokeWidth={2.5} />
      Sólo con rampa
    </button>
  );
}

export default SoloAccesiblesChip;
