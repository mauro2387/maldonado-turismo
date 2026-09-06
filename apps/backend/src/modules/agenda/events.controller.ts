import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, Request, Ip } from '@nestjs/common';
import { EventsService } from './events.service';
import { JwtAuthGuard, Roles, RolesGuard } from '@admin/auth';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('locality') locality?: string,
  ) {
    return this.eventsService.findAll({ category, startDate, endDate, search, locality });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.eventsService.findOne(+id);
  }

  // ========== ADMIN ENDPOINTS (Protected) ==========

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'cultura')
  async create(@Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.eventsService.create(data, req.user.userId, req.user.email, ipAddress);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'cultura')
  async update(@Param('id') id: string, @Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.eventsService.update(+id, data, req.user.userId, req.user.email, ipAddress);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'cultura')
  async delete(@Param('id') id: string, @Request() req, @Ip() ipAddress: string) {
    return this.eventsService.delete(+id, req.user.userId, req.user.email, ipAddress);
  }
}
