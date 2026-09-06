import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, Request, Ip } from '@nestjs/common';
import { PlacesService } from './places.service';
import { JwtAuthGuard, Roles, RolesGuard } from '@admin/auth';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  async findAll(@Query('category') category?: string, @Query('search') search?: string) {
    return this.placesService.findAll(category, search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.placesService.findOne(+id);
  }

  // ========== ADMIN ENDPOINTS (Protected) ==========

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'turismo')
  async create(@Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.placesService.create(data, req.user.userId, req.user.email, ipAddress);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'turismo')
  async update(@Param('id') id: string, @Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.placesService.update(+id, data, req.user.userId, req.user.email, ipAddress);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'turismo')
  async delete(@Param('id') id: string, @Request() req, @Ip() ipAddress: string) {
    return this.placesService.delete(+id, req.user.userId, req.user.email, ipAddress);
  }
}
