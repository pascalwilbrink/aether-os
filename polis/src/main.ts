import { NestFactory } from '@nestjs/core';
import { configureHttpApp } from '@polis/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = configureHttpApp(await NestFactory.create(AppModule));
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
