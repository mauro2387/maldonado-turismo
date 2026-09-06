import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request, Ip } from '@nestjs/common';
import { TransportService } from './transport.service';
import { JwtAuthGuard, Roles, RolesGuard } from '@admin/auth';

@Controller('transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Get('routes')
  async getRoutes() {
    return this.transportService.getRoutes();
  }

  @Get('stops')
  async getStops() {
    return this.transportService.getStops();
  }

  @Get('alerts')
  async getAlerts() {
    return this.transportService.getAlerts();
  }

  // ========== ADMIN ENDPOINTS (Protected) ==========

  // ROUTES
  @Post('routes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'transporte')
  async createRoute(@Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.transportService.createRoute(data, req.user.userId, req.user.email, ipAddress);
  }

  @Put('routes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'transporte')
  async updateRoute(@Param('id') id: string, @Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.transportService.updateRoute(+id, data, req.user.userId, req.user.email, ipAddress);
  }

  @Delete('routes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'transporte')
  async deleteRoute(@Param('id') id: string, @Request() req, @Ip() ipAddress: string) {
    return this.transportService.deleteRoute(+id, req.user.userId, req.user.email, ipAddress);
  }

  // STOPS
  @Post('stops')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'transporte')
  async createStop(@Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.transportService.createStop(data, req.user.userId, req.user.email, ipAddress);
  }

  @Put('stops/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'transporte')
  async updateStop(@Param('id') id: string, @Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.transportService.updateStop(+id, data, req.user.userId, req.user.email, ipAddress);
  }

  @Delete('stops/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'transporte')
  async deleteStop(@Param('id') id: string, @Request() req, @Ip() ipAddress: string) {
    return this.transportService.deleteStop(+id, req.user.userId, req.user.email, ipAddress);
  }

  // ALERTS
  @Post('alerts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'transporte')
  async createAlert(@Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.transportService.createAlert(data, req.user.userId, req.user.email, ipAddress);
  }

  @Put('alerts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'transporte')
  async updateAlert(@Param('id') id: string, @Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.transportService.updateAlert(+id, data, req.user.userId, req.user.email, ipAddress);
  }

  @Delete('alerts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'transporte')
  async deleteAlert(@Param('id') id: string, @Request() req, @Ip() ipAddress: string) {
    return this.transportService.deleteAlert(+id, req.user.userId, req.user.email, ipAddress);
  }
}
