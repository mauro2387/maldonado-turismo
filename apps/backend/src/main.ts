import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
  });

  // Increase body size limit for image uploads (base64)
  app.use(require('express').json({ limit: '50mb' }));
  app.use(require('express').urlencoded({ limit: '50mb', extended: true }));

  // Global prefix
  const apiPrefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // CORS - Permitir localhost + producción
  app.enableCors({
    origin: process.env.API_CORS_ORIGIN?.split(',') || [
      // Development
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      // Los orígenes de producción se declaran en API_CORS_ORIGIN, separados
      // por coma. Acá sólo quedan los de desarrollo y los patrones de las
      // URLs efímeras de previsualización.
      /https:\/\/.*\.vercel\.app$/,
      // Railway/Render preview URLs
      /https:\/\/.*\.up\.railway\.app$/,
      /https:\/\/.*\.onrender\.com$/,
    ],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger documentation
  if (process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Maldonado Turismo API')
      .setDescription('API para la plataforma digital de la Intendencia de Maldonado')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Autenticación y usuarios')
      .addTag('places', 'Lugares turísticos')
      .addTag('events', 'Eventos y agenda')
      .addTag('transport', 'Transporte y paradas')
      .addTag('news', 'Noticias y comunicados')
      .addTag('qr', 'Códigos QR')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.API_PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Maldonado Turismo API running on: http://localhost:${port}/${apiPrefix}`);
  if (process.env.ENABLE_SWAGGER === 'true') {
    console.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
