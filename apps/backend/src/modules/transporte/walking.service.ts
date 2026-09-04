import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { distanceMeters, LngLat } from './geo.util';

/**
 * Las caminatas del viaje: hasta la parada, en el transbordo y desde la última
 * parada hasta el destino.
 *
 * Antes eran una línea recta multiplicada por 1,3. Eso alcanza para ordenar
 * opciones -cuál queda más cerca- pero no para mostrarle a alguien por dónde
 * ir: la recta cruza manzanas, la laguna del Diario y el arroyo Maldonado, y
 * en el mapa se ve exactamente así.
 *
 * Ahora el camino sale de un ruteador **peatonal**, y eso importa más de lo
 * que parece. El servidor público de OSRM (router.project-osrm.org) sólo tiene
 * compilado el perfil de auto: responde lo mismo para /foot que para /driving,
 * con lo cual las caminatas respetaban las manos de las calles y daban vueltas
 * a la manzana que nadie hace a pie. Medido en el centro de Maldonado: 893 m
 * por el camino del auto contra 785 m por el del peatón, por calles distintas.
 *
 * Se usa la instancia peatonal de FOSSGIS (routing.openstreetmap.de/routed-foot),
 * que es la misma que usa el mapa de openstreetmap.org. Para producción
 * conviene levantar OSRM propio con el perfil `foot` y apuntar OSRM_FOOT_URL
 * ahí: el servicio público es de uso razonable, no de producción.
 *
 * El tiempo se calcula de la distancia y no se toma del ruteador, para que la
 * estimación rápida -la que ordena las opciones- y el camino ruteado den lo
 * mismo y las opciones no cambien de orden al dibujarse.
 */

export interface Walk {
  distanceM: number;
  minutes: number;
  /** El camino por la calle. Vacío si el ruteador no contestó. */
  geometry: LngLat[];
  /** True si la geometría es la recta y no el camino real. */
  straight: boolean;
}

/**
 * Paso al que camina la mayoría de la gente en ciudad: 4,8 km/h. Es el mismo
 * valor que usan Google Maps y Moovit por defecto.
 */
const WALK_SPEED_M_PER_MIN = 80;

/**
 * Cuánto más larga es la caminata real que la línea recta, cuando no hay
 * ruteador. En una trama de manzanas rectangulares el factor teórico es 1,27
 * (la relación entre la distancia por las calles y la diagonal); 1,3 lo
 * redondea con un poco de margen por las esquinas.
 */
const DETOUR_FACTOR = 1.3;

/** Caminatas más largas que esto no se rutean: no son una opción a pie. */
const MAX_ROUTED_M = 3000;

/**
 * Hasta dónde se considera que el camino ruteado ya llega al punto pedido.
 * Menos que esto es el ancho de una vereda y cerrarlo dibuja un diente.
 */
const GAP_TOLERANCE_M = 12;

/** Cuántos caminos se recuerdan. Las mismas paradas se repiten todo el tiempo. */
const CACHE_SIZE = 500;

@Injectable()
export class WalkingService {
  private readonly logger = new Logger(WalkingService.name);

  private readonly cache = new Map<string, Walk>();

  constructor(private readonly configService: ConfigService) {}

  /** Ruteador peatonal. Ver el comentario de arriba. */
  private get footRouterUrl(): string {
    return this.configService.get(
      'OSRM_FOOT_URL',
      'https://routing.openstreetmap.de/routed-foot',
    );
  }

  /** La estimación barata, sin salir a la red. Es la que se usa para ordenar. */
  estimate(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Walk {
    const straightM = distanceMeters(from.lat, from.lng, to.lat, to.lng);
    const distanceM = Math.round(straightM * DETOUR_FACTOR);

    return {
      distanceM,
      minutes: this.minutes(distanceM),
      geometry: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      straight: true,
    };
  }

  /**
   * El camino real, para las opciones que efectivamente se van a mostrar.
   *
   * Se pide sólo al final y no al evaluar candidatos: el planificador prueba
   * decenas de combinaciones de paradas y salir a la red por cada una sería
   * pagar un pedido por algo que después se descarta.
   */
  async route(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<Walk> {
    const estimated = this.estimate(from, to);
    if (estimated.distanceM > MAX_ROUTED_M) return estimated;

    const key =
      `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>` + `${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;

    const cached = this.cache.get(key);
    if (cached) return cached;

    try {
      const url =
        `${this.footRouterUrl}/route/v1/foot/` +
        `${from.lng},${from.lat};${to.lng},${to.lat}` +
        `?overview=full&geometries=geojson`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      let body: any;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
        body = await response.json();
      } finally {
        clearTimeout(timeout);
      }

      const route = body?.routes?.[0];
      const routed = route?.geometry?.coordinates as LngLat[] | undefined;
      if (body?.code !== 'Ok' || !routed || routed.length < 2) return estimated;

      // El ruteador contesta entre los puntos de la red peatonal más cercanos
      // a lo que se le pidió, no entre los puntos pedidos: si alguien está en
      // el medio de la manzana o la parada quedó a treinta metros del eje de
      // la calle, el camino dibujado arranca despegado del punto azul y
      // termina despegado de la parada. Se cierran los dos extremos, y esos
      // metros se suman: son metros que hay que caminar igual.
      const startGap = distanceMeters(from.lat, from.lng, routed[0][1], routed[0][0]);
      const endGap = distanceMeters(
        to.lat,
        to.lng,
        routed[routed.length - 1][1],
        routed[routed.length - 1][0],
      );

      const geometry: LngLat[] = [
        ...(startGap > GAP_TOLERANCE_M ? ([[from.lng, from.lat]] as LngLat[]) : []),
        ...routed,
        ...(endGap > GAP_TOLERANCE_M ? ([[to.lng, to.lat]] as LngLat[]) : []),
      ];

      const distanceM = Math.round(
        (route.distance ?? estimated.distanceM) +
          (startGap > GAP_TOLERANCE_M ? startGap : 0) +
          (endGap > GAP_TOLERANCE_M ? endGap : 0),
      );

      const walk: Walk = {
        distanceM,
        // El tiempo se calcula, no se lee: ver el comentario de arriba.
        minutes: this.minutes(distanceM),
        geometry,
        straight: false,
      };

      // Caché simple por antigüedad de inserción: se tira la más vieja.
      if (this.cache.size >= CACHE_SIZE) {
        this.cache.delete(this.cache.keys().next().value as string);
      }
      this.cache.set(key, walk);

      return walk;
    } catch (error: any) {
      // Sin ruteador la caminata sigue existiendo, sólo que dibujada derecho.
      this.logger.debug?.(`Caminata sin rutear: ${error?.message ?? error}`);
      return estimated;
    }
  }

  minutes(meters: number): number {
    return Math.max(1, Math.round(meters / WALK_SPEED_M_PER_MIN));
  }

  /**
   * El paso, para quien necesite la cuenta sin redondear.
   *
   * `minutes()` redondea y nunca baja de 1, que es lo correcto para mostrar
   * "1 min" en pantalla pero no para comparar contra la llegada de un ómnibus:
   * ahí media caminata de 40 segundos contra un coche que llega en 50 hay que
   * poder resolverla con los números finos.
   */
  get speedMPerMin(): number {
    return WALK_SPEED_M_PER_MIN;
  }
}
