import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CorrelationIdMiddleware } from './common/correlation.middleware';
import { GlobalErrorFilter } from './common/error.filter';
import { RequestLoggingMiddleware } from './common/request-logging.middleware';
import { buildCorsOptions } from './cors-options';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(new CorrelationIdMiddleware().use);
  app.use(new RequestLoggingMiddleware().use);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new GlobalErrorFilter());

  const config = new DocumentBuilder().setTitle('AtlasPM Core API').setVersion('1.0').build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.enableCors(buildCorsOptions());
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

bootstrap();
