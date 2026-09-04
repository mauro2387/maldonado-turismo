import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventScraperController } from './scraper/event-scraper.controller';
import { EventScraperService } from './scraper/event-scraper.service';

@Module({
  controllers: [EventsController, EventScraperController],
  providers: [EventsService, EventScraperService],
  exports: [EventsService, EventScraperService],
})
export class EventsModule {}
