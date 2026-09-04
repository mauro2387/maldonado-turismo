import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@admin/auth';
import { EventScraperService } from './event-scraper.service';

/**
 * Panel de la ingesta automática de la agenda.
 *
 * Todo requiere sesión de backoffice: son operaciones de administración y
 * `POST /run` además sale a pegarle a sitios de terceros, así que no puede
 * quedar abierto.
 */
@Controller('admin/events/scraper')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin_sis', 'cultura')
export class EventScraperController {
  constructor(private readonly scraperService: EventScraperService) {}

  /** Resumen para el encabezado del panel. */
  @Get('status')
  async status() {
    return this.scraperService.stats();
  }

  @Get('sources')
  async sources() {
    return this.scraperService.listSources();
  }

  @Get('runs')
  async runs(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.scraperService.listRuns(Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 20);
  }

  /** Eventos que el parser dejó esperando revisión humana. */
  @Get('pending')
  async pending() {
    return this.scraperService.listPending();
  }

  /**
   * Dispara una corrida a mano. Es la misma que corre sola todos los días; el
   * botón existe para no tener que esperar al otro día después de cargar una
   * fuente nueva.
   */
  @Post('run')
  async run(@Request() req) {
    if (this.scraperService.isRunning()) {
      throw new BadRequestException('Ya hay una corrida en curso');
    }

    return this.scraperService.run(req.user.email);
  }

  @Patch('sources/:key')
  async toggleSource(@Param('key') key: string, @Body() body: { enabled?: boolean }) {
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('Falta el campo "enabled"');
    }

    const source = await this.scraperService.setSourceEnabled(key, body.enabled);
    if (!source) throw new NotFoundException('Fuente no encontrada');

    return source;
  }

  @Post('pending/:id/:decision')
  async review(
    @Param('id') id: string,
    @Param('decision') decision: string,
    @Request() req,
    @Ip() ipAddress: string,
  ) {
    if (decision !== 'approve' && decision !== 'reject') {
      throw new BadRequestException('La decisión debe ser "approve" o "reject"');
    }

    const result = await this.scraperService.review(
      +id,
      decision,
      req.user.userId,
      req.user.email,
      ipAddress,
    );
    if (!result) throw new NotFoundException('Evento no encontrado');

    return result;
  }
}
