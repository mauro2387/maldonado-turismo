import { BusStop, BusRoute } from './transportService';

export interface RouteOption {
  id: string;
  routeCode: string;
  routeName: string;
  originStop: string;
  destinationStop: string;
  transfers: number;
  duration: number;
  totalDistance: number;
  steps: RouteStep[];
}

export interface RouteStep {
  type: 'walk' | 'bus' | 'wait';
  routeCode?: string;
  routeName?: string;
  routeColor?: string;
  from: string;
  to: string;
  duration: number;
  distance?: number;
  waitTime?: number;
}

interface StopConnection {
  stopId: number;
  routeId: string;
  distance: number;
}

/**
 * Calcula la distancia haversine entre dos puntos geográficos
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula la distancia entre dos puntos (alias público)
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineDistance(lat1, lon1, lat2, lon2);
}

/**
 * Encuentra la parada más cercana a unas coordenadas
 */
export function findNearestStop(lat: number, lng: number, stops: BusStop[]): BusStop | null {
  if (stops.length === 0) return null;

  let nearestStop = stops[0];
  let minDistance = haversineDistance(lat, lng, stops[0].lat, stops[0].lng);

  for (let i = 1; i < stops.length; i++) {
    const distance = haversineDistance(lat, lng, stops[i].lat, stops[i].lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestStop = stops[i];
    }
  }

  return nearestStop;
}

/**
 * Encuentra paradas cercanas dentro de un radio
 */
export function findNearbyStops(lat: number, lng: number, stops: BusStop[], radiusKm: number = 0.5): BusStop[] {
  return stops
    .map(stop => ({
      stop,
      distance: haversineDistance(lat, lng, stop.lat, stop.lng),
    }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .map(({ stop }) => stop);
}

/**
 * Construye un grafo de conexiones entre paradas
 */
function buildStopGraph(stops: BusStop[], _routes: BusRoute[]): Map<number, StopConnection[]> {
  const graph = new Map<number, StopConnection[]>();

  // Inicializar grafo
  stops.forEach(stop => {
    graph.set(stop.id, []);
  });

  // Conectar paradas que comparten rutas
  stops.forEach(stop1 => {
    if (!stop1.routes || stop1.routes.length === 0) return;

    stops.forEach(stop2 => {
      if (stop1.id === stop2.id || !stop2.routes) return;

      // Buscar rutas en común
      const commonRoutes = (stop1.routes || []).filter(r1 => stop2.routes?.includes(r1));

      if (commonRoutes.length > 0) {
        const distance = haversineDistance(stop1.lat, stop1.lng, stop2.lat, stop2.lng);
        const connections = graph.get(stop1.id) || [];
        
        commonRoutes.forEach(routeId => {
          connections.push({
            stopId: stop2.id,
            routeId: routeId,
            distance: distance,
          });
        });

        graph.set(stop1.id, connections);
      }
    });
  });

  return graph;
}

/**
 * Algoritmo mejorado para encontrar rutas con múltiples opciones
 */
export function findRoutes(
  originStop: BusStop,
  destinationStop: BusStop,
  stops: BusStop[],
  routes: BusRoute[],
  userLocation?: { lat: number; lng: number }
): RouteOption[] {
  const graph = buildStopGraph(stops, routes);
  const results: RouteOption[] = [];

  // Búsqueda de ruta directa (sin transbordos)
  const directRoute = findDirectRoute(originStop, destinationStop, graph, stops, routes, userLocation);
  if (directRoute) {
    results.push(directRoute);
  }

  // Búsqueda de rutas con 1 transbordo
  const transferRoutes = findTransferRoutes(originStop, destinationStop, graph, stops, routes, 1, userLocation);
  results.push(...transferRoutes);

  // Búsqueda de rutas con 2 transbordos (si no hay suficientes opciones)
  if (results.length < 3) {
    const twoTransferRoutes = findMultipleTransferRoutes(originStop, destinationStop, graph, stops, routes, 2, userLocation);
    results.push(...twoTransferRoutes);
  }

  // Ordenar por duración y filtrar duplicados
  const uniqueRoutes = results.filter((route, index, self) =>
    index === self.findIndex((r) => r.id === route.id)
  );

  return uniqueRoutes.sort((a, b) => a.duration - b.duration).slice(0, 5);
}

/**
 * Busca una ruta directa sin transbordos
 */
function findDirectRoute(
  origin: BusStop,
  destination: BusStop,
  graph: Map<number, StopConnection[]>,
  _stops: BusStop[],
  routes: BusRoute[],
  userLocation?: { lat: number; lng: number }
): RouteOption | null {
  const connections = graph.get(origin.id) || [];
  const directConnection = connections.find(conn => conn.stopId === destination.id);

  if (!directConnection) return null;

  const route = routes.find(r => r.id.toString() === directConnection.routeId);
  
  // Calcular distancia de caminata al origen
  let walkToOrigin = 0.3; // 300m promedio por defecto
  if (userLocation) {
    walkToOrigin = haversineDistance(userLocation.lat, userLocation.lng, origin.lat, origin.lng);
  }
  
  const walkFromDest = 0.3; // 300m promedio
  const busDistance = directConnection.distance;

  const walkDuration = Math.ceil((walkToOrigin + walkFromDest) / 0.08); // 80m/min velocidad caminata
  const busDuration = Math.ceil(busDistance / 0.4); // 24 km/h velocidad promedio bus = 0.4 km/min
  
  // Calcular tiempo de espera basado en frecuencia de la ruta
  const waitTime = route?.frequency_minutes || 10;

  return {
    id: `direct-${origin.id}-${destination.id}`,
    routeCode: route?.code || directConnection.routeId,
    routeName: route?.name || 'Línea desconocida',
    originStop: origin.name,
    destinationStop: destination.name,
    transfers: 0,
    duration: walkDuration + waitTime + busDuration,
    totalDistance: walkToOrigin + busDistance + walkFromDest,
    steps: [
      {
        type: 'walk',
        from: userLocation ? 'Tu ubicación' : origin.name,
        to: origin.name,
        duration: Math.ceil(walkToOrigin / 0.08),
        distance: Math.round(walkToOrigin * 1000),
      },
      {
        type: 'wait',
        from: origin.name,
        to: origin.name,
        duration: waitTime,
        waitTime: waitTime,
      },
      {
        type: 'bus',
        routeCode: route?.code || directConnection.routeId,
        routeName: route?.name,
        routeColor: route?.route_color,
        from: origin.name,
        to: destination.name,
        duration: busDuration,
        distance: Math.round(busDistance * 1000),
      },
      {
        type: 'walk',
        from: destination.name,
        to: 'Tu destino',
        duration: Math.ceil(walkFromDest / 0.08),
        distance: Math.round(walkFromDest * 1000),
      },
    ],
  };
}

/**
 * Busca rutas con transbordos
 */
function findTransferRoutes(
  origin: BusStop,
  destination: BusStop,
  graph: Map<number, StopConnection[]>,
  stops: BusStop[],
  routes: BusRoute[],
  _maxTransfers: number,
  userLocation?: { lat: number; lng: number }
): RouteOption[] {
  const results: RouteOption[] = [];
  const originConnections = graph.get(origin.id) || [];

  // Calcular distancia de caminata al origen
  let walkToOrigin = 0.3;
  if (userLocation) {
    walkToOrigin = haversineDistance(userLocation.lat, userLocation.lng, origin.lat, origin.lng);
  }

  // Para cada parada conectada al origen
  originConnections.forEach(firstLeg => {
    const transferStop = stops.find(s => s.id === firstLeg.stopId);
    if (!transferStop) return;

    const transferConnections = graph.get(transferStop.id) || [];
    
    // Buscar conexión desde la parada de transbordo al destino
    const secondLeg = transferConnections.find(conn => conn.stopId === destination.id);
    if (!secondLeg) return;

    // Validar que no use la misma ruta (debe ser transbordo real)
    if (firstLeg.routeId === secondLeg.routeId) return;

    const route1 = routes.find(r => r.id.toString() === firstLeg.routeId);
    const route2 = routes.find(r => r.id.toString() === secondLeg.routeId);

    const walkTransfer = 0.15; // 150m caminata de transbordo
    const walkFromDest = 0.3;
    
    const walkDuration = Math.ceil((walkToOrigin + walkTransfer + walkFromDest) / 0.08);
    const bus1Duration = Math.ceil(firstLeg.distance / 0.4);
    const bus2Duration = Math.ceil(secondLeg.distance / 0.4);
    
    // Tiempo de espera basado en frecuencias
    const wait1 = route1?.frequency_minutes || 10;
    const wait2 = route2?.frequency_minutes || 10;
    const waitTime = wait1 + wait2;

    results.push({
      id: `transfer-${origin.id}-${transferStop.id}-${destination.id}`,
      routeCode: `${route1?.code || firstLeg.routeId} → ${route2?.code || secondLeg.routeId}`,
      routeName: 'Con transbordo',
      originStop: origin.name,
      destinationStop: destination.name,
      transfers: 1,
      duration: walkDuration + waitTime + bus1Duration + bus2Duration,
      totalDistance: walkToOrigin + firstLeg.distance + walkTransfer + secondLeg.distance + walkFromDest,
      steps: [
        {
          type: 'walk',
          from: userLocation ? 'Tu ubicación' : origin.name,
          to: origin.name,
          duration: Math.ceil(walkToOrigin / 0.08),
          distance: Math.round(walkToOrigin * 1000),
        },
        {
          type: 'wait',
          from: origin.name,
          to: origin.name,
          duration: wait1,
          waitTime: wait1,
        },
        {
          type: 'bus',
          routeCode: route1?.code || firstLeg.routeId,
          routeName: route1?.name,
          routeColor: route1?.route_color,
          from: origin.name,
          to: transferStop.name,
          duration: bus1Duration,
          distance: Math.round(firstLeg.distance * 1000),
        },
        {
          type: 'walk',
          from: transferStop.name,
          to: `${transferStop.name} (transbordo)`,
          duration: Math.ceil(walkTransfer / 0.08),
          distance: Math.round(walkTransfer * 1000),
        },
        {
          type: 'wait',
          from: `${transferStop.name} (transbordo)`,
          to: `${transferStop.name} (transbordo)`,
          duration: wait2,
          waitTime: wait2,
        },
        {
          type: 'bus',
          routeCode: route2?.code || secondLeg.routeId,
          routeName: route2?.name,
          routeColor: route2?.route_color,
          from: transferStop.name,
          to: destination.name,
          duration: bus2Duration,
          distance: Math.round(secondLeg.distance * 1000),
        },
        {
          type: 'walk',
          from: destination.name,
          to: 'Tu destino',
          duration: Math.ceil(walkFromDest / 0.08),
          distance: Math.round(walkFromDest * 1000),
        },
      ],
    });
  });

  return results;
}

/**
 * Busca rutas con múltiples transbordos (2 o más)
 */
function findMultipleTransferRoutes(
  origin: BusStop,
  destination: BusStop,
  graph: Map<number, StopConnection[]>,
  stops: BusStop[],
  routes: BusRoute[],
  maxTransfers: number,
  userLocation?: { lat: number; lng: number }
): RouteOption[] {
  if (maxTransfers < 2) return [];
  
  const results: RouteOption[] = [];
  const originConnections = graph.get(origin.id) || [];

  // Calcular distancia de caminata al origen
  let walkToOrigin = 0.3;
  if (userLocation) {
    walkToOrigin = haversineDistance(userLocation.lat, userLocation.lng, origin.lat, origin.lng);
  }

  // Búsqueda con 2 transbordos
  originConnections.forEach(firstLeg => {
    const stop1 = stops.find(s => s.id === firstLeg.stopId);
    if (!stop1) return;

    const connections1 = graph.get(stop1.id) || [];
    
    connections1.forEach(secondLeg => {
      if (firstLeg.routeId === secondLeg.routeId) return;
      
      const stop2 = stops.find(s => s.id === secondLeg.stopId);
      if (!stop2) return;

      const connections2 = graph.get(stop2.id) || [];
      const thirdLeg = connections2.find(conn => conn.stopId === destination.id);
      
      if (!thirdLeg || secondLeg.routeId === thirdLeg.routeId) return;

      const route1 = routes.find(r => r.id.toString() === firstLeg.routeId);
      const route2 = routes.find(r => r.id.toString() === secondLeg.routeId);
      const route3 = routes.find(r => r.id.toString() === thirdLeg.routeId);

      const walkTransfer1 = 0.15;
      const walkTransfer2 = 0.15;
      const walkFromDest = 0.3;
      
      const walkDuration = Math.ceil((walkToOrigin + walkTransfer1 + walkTransfer2 + walkFromDest) / 0.08);
      const bus1Duration = Math.ceil(firstLeg.distance / 0.4);
      const bus2Duration = Math.ceil(secondLeg.distance / 0.4);
      const bus3Duration = Math.ceil(thirdLeg.distance / 0.4);
      
      const wait1 = route1?.frequency_minutes || 10;
      const wait2 = route2?.frequency_minutes || 10;
      const wait3 = route3?.frequency_minutes || 10;
      const waitTime = wait1 + wait2 + wait3;

      results.push({
        id: `transfer2-${origin.id}-${stop1.id}-${stop2.id}-${destination.id}`,
        routeCode: `${route1?.code || firstLeg.routeId} → ${route2?.code || secondLeg.routeId} → ${route3?.code || thirdLeg.routeId}`,
        routeName: 'Con 2 transbordos',
        originStop: origin.name,
        destinationStop: destination.name,
        transfers: 2,
        duration: walkDuration + waitTime + bus1Duration + bus2Duration + bus3Duration,
        totalDistance: walkToOrigin + firstLeg.distance + walkTransfer1 + secondLeg.distance + walkTransfer2 + thirdLeg.distance + walkFromDest,
        steps: [
          {
            type: 'walk',
            from: userLocation ? 'Tu ubicación' : origin.name,
            to: origin.name,
            duration: Math.ceil(walkToOrigin / 0.08),
            distance: Math.round(walkToOrigin * 1000),
          },
          {
            type: 'wait',
            from: origin.name,
            to: origin.name,
            duration: wait1,
            waitTime: wait1,
          },
          {
            type: 'bus',
            routeCode: route1?.code || firstLeg.routeId,
            routeName: route1?.name,
            from: origin.name,
            to: stop1.name,
            duration: bus1Duration,
            distance: Math.round(firstLeg.distance * 1000),
          },
          {
            type: 'walk',
            from: stop1.name,
            to: stop1.name,
            duration: Math.ceil(walkTransfer1 / 0.08),
            distance: Math.round(walkTransfer1 * 1000),
          },
          {
            type: 'wait',
            from: stop1.name,
            to: stop1.name,
            duration: wait2,
            waitTime: wait2,
          },
          {
            type: 'bus',
            routeCode: route2?.code || secondLeg.routeId,
            routeName: route2?.name,
            from: stop1.name,
            to: stop2.name,
            duration: bus2Duration,
            distance: Math.round(secondLeg.distance * 1000),
          },
          {
            type: 'walk',
            from: stop2.name,
            to: stop2.name,
            duration: Math.ceil(walkTransfer2 / 0.08),
            distance: Math.round(walkTransfer2 * 1000),
          },
          {
            type: 'wait',
            from: stop2.name,
            to: stop2.name,
            duration: wait3,
            waitTime: wait3,
          },
          {
            type: 'bus',
            routeCode: route3?.code || thirdLeg.routeId,
            routeName: route3?.name,
            from: stop2.name,
            to: destination.name,
            duration: bus3Duration,
            distance: Math.round(thirdLeg.distance * 1000),
          },
          {
            type: 'walk',
            from: destination.name,
            to: 'Tu destino',
            duration: Math.ceil(walkFromDest / 0.08),
            distance: Math.round(walkFromDest * 1000),
          },
        ],
      });
    });
  });

  return results.slice(0, 2); // Limitar a 2 opciones con 2 transbordos
}

export const routePlannerService = {
  findNearestStop,
  findNearbyStops,
  findRoutes,
  calculateDistance,
};
