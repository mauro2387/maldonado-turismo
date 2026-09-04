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
        url: configService.get('DATABASE_URL'),
        // Las entidades se registran desde cada módulo con
        // `TypeOrmModule.forFeature`, no barriendo el disco.
        //
        // El glob `__dirname + '/**/*.entity.js'` no encontraba nada: la API se
        // empaqueta con webpack en un único dist/main.js, así que no existe un
        // archivo .entity.js que barrer. El DataSource arrancaba sin ninguna
        // entidad y cualquier endpoint que usara un repositorio moría con
        // "No metadata for BusStop was found" — un 500 sin más explicación, que
        // es lo que tiraban GET /transport/stops/:id y /transport/stops/nearby.
        autoLoadEntities: true,
        synchronize: false,
        // La ingesta GPS escribe decenas de filas cada pocos segundos, así que
        // el log de todas las queries tapa cualquier otra cosa. Se activa a
        // demanda con DATABASE_LOGGING=true.
        logging:
          configService.get('DATABASE_LOGGING', 'false') === 'true'
            ? true
            : ['error', 'warn'],
        // Supabase y cualquier base gestionada exigen TLS; una Postgres local
        // no lo tiene habilitado y rechaza la conexión si se lo pedimos.
        ssl:
          configService.get('DATABASE_SSL', 'true') === 'true'
            ? { rejectUnauthorized: false }
            : false,
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
