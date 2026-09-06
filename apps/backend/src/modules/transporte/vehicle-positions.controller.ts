import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { VehiclePositionsService } from './vehicle-positions.service';
import { RouteShapesService } from './route-shapes.service';
import { isElectricVehicle, isInService } from './fleet.util';
import { OfficialRoutesService } from './official-routes.service';
import { CatchBusService } from './catch-bus.service';

@Controller('transport/vehicles')
export class VehiclePositionsController {
  constructor(
    private readonly service: VehiclePositionsService,
    private readonly routeShapes: RouteShapesService,
    private readonly officialRoutes: OfficialRoutesService,
    private readonly catcher: CatchBusService,
  ) {}

  @Get()
  async latest() {
    const positions = await this.service.getLatestPositions();

    // La posición cruda del GPS cae a decenas de metros de la calle y en el
    // mapa el ómnibus termina arriba de una manzana. Se la proyecta sobre el
    // recorrido reconstruido de su línea; si todavía no hay recorrido, o si el
    // coche está demasiado lejos de él, se devuelve la posición tal cual.
    return positions.map((position) => {
      // La propulsión no está en la base porque tampoco está en el feed: es un
      // dato de flota que se resuelve por número de coche.
      const withFleet = {
        ...position,
        electric: isElectricVehicle(position.vehicle_id),
        // El número del cartel: el feed publica los refuerzos con los dos
        // números pegados ("179" por la 17/19) y eso no existe en la calle.
        line_label: this.officialRoutes.lineLabel(position.operator, position.line_code),
        // Un coche yendo a cargar combustible es un ómnibus en la calle, pero
        // no un servicio: el mapa lo tiene que dejar afuera para no mandar a
        // nadie a esperarlo.
        in_service: isInService(position.line_name),
      };

      // Se proyecta sobre el recorrido de **su** itinerario, no sobre uno
      // cualquiera de su línea: la 24 hace cuatro recorridos por avenidas
      // distintas y pegar el coche al que no corresponde lo pone en una calle
      // por la que no está pasando.
      const snapped = this.routeShapes.snap(
        Number(position.latitude),
        Number(position.longitude),
        position.operator,
        position.line_code,
        position.line_name,
      );

      if (!snapped) return { ...withFleet, snapped: false };

      return {
        ...withFleet,
        latitude: snapped.latitude,
        longitude: snapped.longitude,
        raw_latitude: position.latitude,
        raw_longitude: position.longitude,
        snap_offset_m: Math.round(snapped.offsetMeters),
        snapped: true,
      };
    });
  }

  /**
   * ¿Llego a tomar este coche, y dónde?
   *
   * Lo pregunta la pantalla cuando alguien toca un ómnibus en el mapa. La
   * cuenta se hace acá y no allá porque acá están la velocidad medida de la
   * línea, el ruteo a pie por calle y el orden de paradas del recorrido; con
   * constantes escritas en el frontend el resultado era sistemáticamente que
   * no se llegaba (ver CatchBusService).
   *
   * Va por GET porque no cambia nada, pero la ubicación viene redondeada a
   * cinco decimales desde la pantalla: un metro alcanza para esto y no deja
   * la posición exacta de nadie en los logs de acceso.
   */
  @Get(':vehicleId/catch')
  async catchBus(
    @Param('vehicleId') vehicleId: string,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    const from = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng)) {
      throw new BadRequestException('Faltan lat y lng');
    }
    return this.catcher.evaluate(vehicleId, from);
  }

  // Simple ingestion endpoint for simulator/dev
  @Post()
  async create(@Body() body: any) {
    // body: { vehicle_id, route_id, latitude, longitude, heading, speed }
    return await this.service.insertPosition(body);
  }
}
