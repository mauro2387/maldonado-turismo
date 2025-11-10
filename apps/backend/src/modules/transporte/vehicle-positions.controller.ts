import { Controller, Get, Post, Body } from '@nestjs/common';
import { VehiclePositionsService } from './vehicle-positions.service';

@Controller('transport/vehicles')
export class VehiclePositionsController {
  constructor(private readonly service: VehiclePositionsService) {}

  @Get()
  async latest() {
    return await this.service.getLatestPositions();
  }

  // Simple ingestion endpoint for simulator/dev
  @Post()
  async create(@Body() body: any) {
    // body: { vehicle_id, route_id, latitude, longitude, heading, speed }
    return await this.service.insertPosition(body);
  }
}
