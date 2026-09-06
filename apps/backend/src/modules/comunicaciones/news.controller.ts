import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, Request, Ip } from '@nestjs/common';
import { NewsService } from './news.service';
import { JwtAuthGuard, Roles, RolesGuard } from '@admin/auth';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('featured') featured?: string,
    @Query('search') search?: string,
  ) {
    return this.newsService.findAll({ 
      category, 
      featured: featured === 'true',
      search 
    });
  }

  @Get('featured')
  async getFeatured(@Query('limit') limit?: string) {
    return this.newsService.getFeatured(limit ? parseInt(limit) : 2);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.newsService.findOne(+id);
  }

  @Post(':id/view')
  async incrementViews(@Param('id') id: string) {
    await this.newsService.incrementViews(+id);
    return { success: true };
  }

  // ========== ADMIN ENDPOINTS (Protected) ==========

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'prensa')
  async create(@Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.newsService.create(data, req.user.userId, req.user.email, ipAddress);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'prensa')
  async update(@Param('id') id: string, @Body() data: any, @Request() req, @Ip() ipAddress: string) {
    return this.newsService.update(+id, data, req.user.userId, req.user.email, ipAddress);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin_sis', 'prensa')
  async delete(@Param('id') id: string, @Request() req, @Ip() ipAddress: string) {
    return this.newsService.delete(+id, req.user.userId, req.user.email, ipAddress);
  }
}
