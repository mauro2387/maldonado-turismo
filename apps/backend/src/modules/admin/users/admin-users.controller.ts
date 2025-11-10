import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  UseGuards,
  Request,
  Ip
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminUsersService } from './admin-users.service';

@Controller('admin/users')
@UseGuards(JwtAuthGuard)
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Post()
  create(@Body() data: any, @Request() req, @Ip() ip: string) {
    return this.usersService.create(data, req.user.userId, req.user.email, ip);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req, @Ip() ip: string) {
    return this.usersService.update(+id, data, req.user.userId, req.user.email, ip);
  }

  @Put(':id/password')
  changePassword(@Param('id') id: string, @Body('password') password: string, @Request() req, @Ip() ip: string) {
    return this.usersService.changePassword(+id, password, req.user.userId, req.user.email, ip);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req, @Ip() ip: string) {
    return this.usersService.remove(+id, req.user.userId, req.user.email, ip);
  }
}
