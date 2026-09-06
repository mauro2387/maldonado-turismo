import { useCallback, useEffect, useState } from 'react';
import { Coords } from '@lib/geo';

/**
 * Ubicación del usuario.
 *
 * El permiso se pide una sola vez y el resultado se comparte: antes cada
 * pantalla llamaba a `navigator.geolocation` por su cuenta y avisaba los
 * errores con `alert()` del navegador.
 *
 * Cuando no hay permiso se cae al centro de Maldonado para que el mapa y las
 * listas tengan algo que mostrar, pero `granted` queda en false para que la
 * interfaz pueda ofrecer activarlo.
 */

/** Plaza San Fernando, centro de Maldonado. */
export const MALDONADO_CENTER: Coords = { lat: -34.9011, lng: -54.9497 };

export type GeoStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';

interface UseGeolocationResult {
  /** Posición del usuario, o el centro de Maldonado si todavía no hay permiso. */
  coords: Coords;
  /** True solo si `coords` es la posición real del usuario. */
  granted: boolean;
  status: GeoStatus;
  /** Mensaje listo para mostrar en la interfaz, no en un alert. */
  message: string | null;
  request: () => void;
}

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000,
};

export function useGeolocation(auto = true): UseGeolocationResult {
  const [coords, setCoords] = useState<Coords>(MALDONADO_CENTER);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setMessage('Tu navegador no puede darnos tu ubicación.');
      return;
    }

    setStatus('locating');
    setMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus('granted');
        setMessage(null);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied');
          setMessage('Sin tu ubicación mostramos el centro de Maldonado. Podés activarla desde los permisos del navegador.');
        } else {
          setStatus('unavailable');
          setMessage('No pudimos ubicarte. Mostramos el centro de Maldonado.');
        }
      },
      OPTIONS,
    );
  }, []);

  useEffect(() => {
    if (auto) request();
  }, [auto, request]);

  return { coords, granted: status === 'granted', status, message, request };
}

export default useGeolocation;
