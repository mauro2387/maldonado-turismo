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
import { VehiclePositionsService } from './vehicle-positions.service';
import { VehiclePositionsController } from './vehicle-positions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusRoute,
      BusStop,
      TransportAlert,
      VehiclePosition,
    ]),
  ],
  controllers: [
    TransportController,
    BusRoutesController,
    BusStopsController,
    TransportAlertsController,
    VehiclePositionsController,
  ],
  providers: [
    TransportService,
    BusRoutesService,
    BusStopsService,
    TransportAlertsService,
    VehiclePositionsService,
  ],
  exports: [
    TransportService,
    BusRoutesService,
    BusStopsService,
    TransportAlertsService,
    VehiclePositionsService,
  ],
})
export class TransportModule {}
