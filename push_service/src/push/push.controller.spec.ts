import { Test, TestingModule } from '@nestjs/testing';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { RmqContext } from '@nestjs/microservices';
import { PushJobData } from './interfaces/push.types';

describe('PushController', () => {
  let controller: PushController;
  let pushService: jest.Mocked<PushService>;

  const mockJobData: PushJobData = {
    user_id: 123,
    template_id: 'welcome-push',
    notification_type: 'push',
    correlation_id: 'corr-123',
    user_data: {
      id: 123,
      email: 'test@example.com',
      push_token: 'test-push-token-123',
      preferences: {
        email: true,
        push: true,
      },
    },
    template_content: JSON.stringify({
      title: 'Hello',
      body: 'Welcome!',
    }),
  };

  const mockChannel = {
    ack: jest.fn(),
    nack: jest.fn(),
  };

  const mockMessage = {
    content: Buffer.from(JSON.stringify(mockJobData)),
    fields: {},
    properties: {},
  };

  const mockContext: RmqContext = {
    getChannelRef: jest.fn(() => mockChannel as any),
    getMessage: jest.fn(() => mockMessage as any),
    getPattern: jest.fn(),
    getRpcContext: jest.fn(),
    getData: jest.fn(),
    getArgs: jest.fn(),
  } as any;

  beforeEach(async () => {
    const mockPushService = {
      processPushJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [
        {
          provide: PushService,
          useValue: mockPushService,
        },
      ],
    }).compile();

    controller = module.get<PushController>(PushController);
    pushService = module.get(PushService);

    // Mock logger methods
    jest.spyOn(controller['logger'], 'log').mockImplementation();
    jest.spyOn(controller['logger'], 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handlePushJob', () => {
    it('should process push job successfully and ack message', async () => {
      // Arrange
      pushService.processPushJob.mockResolvedValueOnce(true);

      // Act
      await controller.handlePushJob(mockJobData, mockContext);

      // Assert
      expect(pushService.processPushJob).toHaveBeenCalledWith(mockJobData);
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
      expect(mockChannel.nack).not.toHaveBeenCalled();
      expect(controller['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('Push notification processed successfully'),
      );
    });

    it('should nack message when processing fails', async () => {
      // Arrange
      const error = new Error('Processing failed');
      pushService.processPushJob.mockRejectedValueOnce(error);

      // Act
      await controller.handlePushJob(mockJobData, mockContext);

      // Assert
      expect(pushService.processPushJob).toHaveBeenCalledWith(mockJobData);
      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
      expect(controller['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process push notification'),
        error,
      );
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const error = new Error('FCM service unavailable');
      pushService.processPushJob.mockRejectedValueOnce(error);

      // Act
      await controller.handlePushJob(mockJobData, mockContext);

      // Assert
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
      expect(controller['logger'].error).toHaveBeenCalled();
    });

    it('should log correlation ID on success', async () => {
      // Arrange
      pushService.processPushJob.mockResolvedValueOnce(true);

      // Act
      await controller.handlePushJob(mockJobData, mockContext);

      // Assert
      expect(controller['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('corr-123'),
      );
    });

    it('should log correlation ID on failure', async () => {
      // Arrange
      const error = new Error('Processing failed');
      pushService.processPushJob.mockRejectedValueOnce(error);

      // Act
      await controller.handlePushJob(mockJobData, mockContext);

      // Assert
      expect(controller['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('corr-123'),
        error,
      );
    });

    it('should not requeue failed messages', async () => {
      // Arrange
      const error = new Error('Processing failed');
      pushService.processPushJob.mockRejectedValueOnce(error);

      // Act
      await controller.handlePushJob(mockJobData, mockContext);

      // Assert
      // nack(message, requeue=false, allUpTo=false) - message goes to dead letter queue
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
    });
  });
});

