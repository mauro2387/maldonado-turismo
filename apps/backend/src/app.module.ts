import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Modules
import { PlacesModule } from './modules/lugares/places.module';
import { EventsModule } from './modules/agenda/events.module';
import { TransportModule } from './modules/transporte/transport.module';
import { NewsModule } from './modules/comunicaciones/news.module';
import { QrModule } from './modules/qr/qr.module';
import { AuthModule } from './modules/admin/auth/auth.module';
import { AdminUsersModule } from './modules/admin/users/admin-users.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST'),
        port: configService.get<number>('DATABASE_PORT'),
        username: configService.get('DATABASE_USER'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
        ssl: configService.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),

    // Feature modules
    AuthModule,
    AdminUsersModule,
    PlacesModule,
    EventsModule,
    TransportModule,
    NewsModule,
    QrModule,
  ],
})
export class AppModule {}
