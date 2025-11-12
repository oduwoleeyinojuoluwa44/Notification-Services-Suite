import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthCheckService, MicroserviceHealthIndicator } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

describe('AppController', () => {
  let appController: AppController;
  let healthCheckService: jest.Mocked<HealthCheckService>;
  let microserviceHealthIndicator: jest.Mocked<MicroserviceHealthIndicator>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockHealthCheckService = {
      check: jest.fn(),
    };

    const mockMicroserviceHealthIndicator = {
      pingCheck: jest.fn(),
    };

    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'RABBITMQ_URL') {
          return 'amqp://user:password@rabbitmq:5672';
        }
        throw new Error(`Config key ${key} not found`);
      }),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: MicroserviceHealthIndicator,
          useValue: mockMicroserviceHealthIndicator,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    healthCheckService = app.get(HealthCheckService);
    microserviceHealthIndicator = app.get(MicroserviceHealthIndicator);
    configService = app.get(ConfigService);
  });

  describe('getHello', () => {
    it('should return "Push Service is running!"', () => {
      expect(appController.getHello()).toBe('Push Service is running!');
    });
  });

  describe('getHealth', () => {
    it('should return health check result', async () => {
      // Arrange
      const mockHealthResult = {
        status: 'ok',
        info: {
          rabbitmq: {
            status: 'up',
          },
        },
      };
      healthCheckService.check.mockResolvedValueOnce(mockHealthResult as any);

      // Act
      const result = await appController.getHealth();

      // Assert
      expect(result).toEqual(mockHealthResult);
      expect(configService.getOrThrow).toHaveBeenCalledWith('RABBITMQ_URL');
      expect(healthCheckService.check).toHaveBeenCalled();
    });

    it('should check RabbitMQ connectivity', async () => {
      // Arrange
      const mockHealthResult = { status: 'ok' };
      healthCheckService.check.mockResolvedValueOnce(mockHealthResult as any);

      // Act
      await appController.getHealth();

      // Assert
      expect(healthCheckService.check).toHaveBeenCalledWith([
        expect.any(Function),
      ]);
    });

    it('should throw error if RABBITMQ_URL is not configured', async () => {
      // Arrange
      configService.getOrThrow.mockImplementation(() => {
        throw new Error('RABBITMQ_URL not found');
      });

      // Act & Assert
      await expect(appController.getHealth()).rejects.toThrow('RABBITMQ_URL not found');
    });
  });
});
