import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const tempApp = await NestFactory.createApplicationContext(AppModule);
  const configService = tempApp.get(ConfigService)

  const rabbitMqUrl = configService.getOrThrow<string>('RABBITMQ_URL');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitMqUrl],
        queue: 'email_queue',
        noAck: false,
        queueOptions: {
          durable: true,
        }
      }
    }
  );

  await app.listen();
  console.log('Email service is listening for messages...');
}
bootstrap();
