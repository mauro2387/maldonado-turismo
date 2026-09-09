import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';
import { BusRoutesController } from './bus-routes.controller';
import { BusRoutesService } from './bus-routes.service';
import { BusStopsController } from './bus-stops.controller';
import { BusStopsService } from './bus-stops.service';
import { TransportAlertsController } from './transport-alerts.controller';
import { TransportAlertsService } from './transport-alerts.service';
import { BusRoute } from './entities/bus-route.entity';
import { BusStop } from './entities/bus-stop.entity';
import { TransportAlert } from './entities/transport-alert.entity';
import { VehiclePosition } from './entities/vehicle-position.entity';
import { RouteStop } from './entities/route-stop.entity';
import { StopTime } from './entities/stop-time.entity';
import { BusTrip } from './entities/bus-trip.entity';
import { ServiceCalendar } from './entities/service-calendar.entity';
import { RouteGeometry } from './entities/route-geometry.entity';
import { VehiclePositionsService } from './vehicle-positions.service';
import { VehiclePositionsController } from './vehicle-positions.controller';
import { GpsFeedService } from './gps-feed.service';
import { RouteShapesService } from './route-shapes.service';
import { OfficialRoutesService } from './official-routes.service';
import { RouteShapesController } from './route-shapes.controller';
import { StopsReaderService } from './stops-reader.service';
import { StopCatalogService } from './stop-catalog.service';
import { StopPlacementService } from './stop-placement.service';
import { StopObservationsService } from './stop-observations.service';
import { StopSequenceService } from './stop-sequence.service';
import { ArrivalsService } from './arrivals.service';
import { ArrivalsController } from './arrivals.controller';
import { TripPlannerService } from './trip-planner.service';
import { WalkingService } from './walking.service';
import { LineSpeedService } from './line-speed.service';
import { CatchBusService } from './catch-bus.service';
import { FeedHealthService } from './feed-health.service';
import { TransportHealthController } from './transport-health.controller';
import { StopScheduleController } from './stop-schedule.controller';
import { DestinationsService } from './destinations.service';
import { SchedulesService } from './schedules.service';
import { DestinationsController } from './destinations.controller';
import { WalkingController } from './walking.controller';
import { LinesController } from './lines.controller';
import { TripPlannerController } from './trip-planner.controller';
import { RideService } from './ride.service';
import { RideController } from './ride.controller';

@Module({
  imports: [
    // El modelo entero, no solo las tablas que hoy se consultan.
    //
    // BusStop y BusRoute declaran relaciones hacia route_stops, stop_times,
    // bus_trips y route_geometries. TypeORM resuelve esas relaciones al armar
    // la metadata, así que si las contrapartes no están registradas el
    // DataSource no llega a levantar: "Entity metadata for BusStop#route_stops
    // was not found". Registrarlas no consulta nada —esas tablas todavía no
    // existen en la base— pero deja el modelo completo.
    TypeOrmModule.forFeature([
      BusRoute,
      BusStop,
      TransportAlert,
      VehiclePosition,
      RouteStop,
      StopTime,
      BusTrip,
      ServiceCalendar,
      RouteGeometry,
    ]),
  ],
  controllers: [
    TransportController,
    BusRoutesController,
    BusStopsController,
    TransportAlertsController,
    VehiclePositionsController,
    RouteShapesController,
    ArrivalsController,
    TripPlannerController,
    RideController,
    DestinationsController,
    WalkingController,
    LinesController,
      TransportHealthController,
      StopScheduleController,
  ],
  providers: [
    TransportService,
    BusRoutesService,
    BusStopsService,
    TransportAlertsService,
    VehiclePositionsService,
    GpsFeedService,
    RouteShapesService,
    OfficialRoutesService,
    StopsReaderService,
    StopCatalogService,
    StopObservationsService,
    StopPlacementService,
    StopSequenceService,
    ArrivalsService,
    TripPlannerService,
    WalkingService,
    LineSpeedService,
    CatchBusService,
    RideService,
    FeedHealthService,
    DestinationsService,
    SchedulesService,
  ],
  exports: [
    TransportService,
    BusRoutesService,
    BusStopsService,
    TransportAlertsService,
    VehiclePositionsService,
    OfficialRoutesService,
    StopsReaderService,
    StopCatalogService,
    StopObservationsService,
    StopPlacementService,
    StopSequenceService,
    ArrivalsService,
    TripPlannerService,
    DestinationsService,
    SchedulesService,
  ],
})
export class TransportModule {}
