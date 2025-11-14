import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MicroserviceHealthIndicator } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { Transport } from '@nestjs/microservices';
import { SendgridService } from './sendgrid/sendgrid.service';

@Controller('api/v1')
export class AppController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly microservice: MicroserviceHealthIndicator,
    private readonly configService: ConfigService,
    private readonly sendgridService: SendgridService,
  ) {}

  @Get('health')
  @HealthCheck()
  getHealth() {
    const rabbitMqUrl = this.configService.getOrThrow<string>('RABBITMQ_URL');
    const circuitBreakerState = this.sendgridService.getCircuitBreakerState();
    const circuitBreakerStats = this.sendgridService.getCircuitBreakerStats();

    return this.health.check([
      () => this.microservice.pingCheck('rabbitmq', {
        transport: Transport.RMQ,
        options: {
          urls: [rabbitMqUrl],
        },
      }),
    ]).then((result) => ({
      ...result,
      circuitBreaker: {
        state: circuitBreakerState,
        stats: circuitBreakerStats,
      },
    }));
  }
}
