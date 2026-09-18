import { create } from 'zustand';
import { useGeolocation, GeoStatus } from '@hooks/useGeolocation';
import { Coords } from '@lib/geo';

/**
 * Dónde está la persona: el GPS, o lo que ella diga.
 *
 * Sin permiso de ubicación la app cae al centro de Maldonado y ahí termina:
 * las llegadas son de las paradas del centro y el planificador sale del
 * centro, para alguien que puede estar en San Carlos. No hay forma de
 * corregirlo, y el permiso de ubicación negado **no se vuelve a pedir**: el
 * navegador lo recuerda para siempre y hay que ir a la configuración del
 * sitio, que nadie hace.
 *
 * También pasa con el permiso dado: quien planifica desde la oficina el
 * viaje que va a hacer desde su casa quiere ver las llegadas de la parada de
 * su casa.
 *
 * Así que el punto se puede fijar a mano. Es una sola cosa para toda la app
 * —las llegadas cercanas, lo que se ve en la portada, el origen de un
 * viaje— y por eso vive en un store y no en una pantalla. No se guarda en el
 * disco a propósito: dura lo que dura la sesión. Decir "estoy en la Terminal"
 * un martes y que la app siga creyéndolo el jueves es peor que no poder
 * decirlo.
 */

export interface PuntoManual {
  name: string;
  lat: number;
  lng: number;
}

interface DondeEstoyState {
  manual: PuntoManual | null;
  fijar: (punto: PuntoManual) => void;
  soltar: () => void;
}

export const useDondeEstoyStore = create<DondeEstoyState>((set) => ({
  manual: null,
  fijar: (punto) => set({ manual: punto }),
  soltar: () => set({ manual: null }),
}));

export interface DondeEstoy {
  /** El punto que hay que usar: el fijado a mano, el del GPS, o el centro. */
  coords: Coords;
  /** Cómo se llama ese punto, para decirlo en pantalla. */
  nombre: string;
  /** True sólo si `coords` es la posición real del GPS. */
  granted: boolean;
  /** True cuando el punto lo eligió la persona. */
  manual: boolean;
  status: GeoStatus;
  message: string | null;
  request: () => void;
  fijar: (punto: PuntoManual) => void;
  soltar: () => void;
}

/**
 * El punto que tiene que usar una pantalla, y cómo nombrarlo.
 *
 * `auto` se pasa igual que a `useGeolocation`: false para no pedir el
 * permiso al abrir una pantalla donde la ubicación es opcional.
 */
export function useDondeEstoy(auto = true): DondeEstoy {
  const { coords, granted, status, message, request } = useGeolocation(auto);
  const manual = useDondeEstoyStore((estado) => estado.manual);
  const fijar = useDondeEstoyStore((estado) => estado.fijar);
  const soltar = useDondeEstoyStore((estado) => estado.soltar);

  if (manual) {
    return {
      coords: { lat: manual.lat, lng: manual.lng },
      nombre: manual.name,
      granted: false,
      manual: true,
      status,
      message,
      request,
      fijar,
      soltar,
    };
  }

  return {
    coords,
    nombre: granted ? 'Tu ubicación' : 'Centro de Maldonado',
    granted,
    manual: false,
    status,
    message,
    request,
    fijar,
    soltar,
  };
}

export default useDondeEstoy;
