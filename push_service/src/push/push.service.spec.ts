import { Test, TestingModule } from '@nestjs/testing';
import { PushService } from './push.service';
import { ConfigService } from '@nestjs/config';
import { FcmService } from '../fcm/fcm.service';
import { PushJobData } from './interfaces/push.types';

describe('PushService', () => {
  let service: PushService;
  let configService: jest.Mocked<ConfigService>;
  let fcmService: jest.Mocked<FcmService>;

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
      title: 'Hello {{name}}',
      body: 'Welcome to our service!',
      link: 'https://example.com/{{link}}',
    }),
    variables: {
      name: 'John Doe',
      link: 'dashboard',
    },
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    };

    const mockFcmService = {
      sendPushNotification: jest.fn(),
      validateToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: FcmService,
          useValue: mockFcmService,
        },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
    configService = module.get(ConfigService);
    fcmService = module.get(FcmService);

    // Mock logger methods to avoid cluttering test output
    jest.spyOn(service['logger'], 'log').mockImplementation();
    jest.spyOn(service['logger'], 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processPushJob', () => {
    it('should successfully process push job with provided data', async () => {
      // Arrange
      fcmService.sendPushNotification.mockResolvedValueOnce('message-id-123');

      // Act
      const result = await service.processPushJob(mockJobData);

      // Assert
      expect(result).toBe(true);
      expect(fcmService.sendPushNotification).toHaveBeenCalledWith(
        'test-push-token-123',
        {
          title: 'Hello John Doe',
          body: 'Welcome to our service!',
          link: 'https://example.com/dashboard',
        },
      );
      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('Job completed successfully'),
      );
    });

    it('should skip non-push notifications', async () => {
      // Arrange
      const emailNotificationData: PushJobData = {
        ...mockJobData,
        notification_type: 'email',
      };

      // Act
      const result = await service.processPushJob(emailNotificationData);

      // Assert
      expect(result).toBe(true);
      expect(fcmService.sendPushNotification).not.toHaveBeenCalled();
      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('Skipping non-push notification'),
      );
    });

    it('should skip push if user has disabled push notifications', async () => {
      // Arrange
      const jobDataWithDisabledPush: PushJobData = {
        ...mockJobData,
        user_data: {
          ...mockJobData.user_data,
          preferences: {
            email: true,
            push: false,
          },
        },
      };

      // Act
      const result = await service.processPushJob(jobDataWithDisabledPush);

      // Assert
      expect(result).toBe(true);
      expect(fcmService.sendPushNotification).not.toHaveBeenCalled();
      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('has disabled push notifications'),
      );
    });

    it('should throw error when push token is missing', async () => {
      // Arrange
      const jobDataWithoutToken: PushJobData = {
        ...mockJobData,
        user_data: {
          ...mockJobData.user_data,
          push_token: undefined,
        },
      };

      // Act & Assert
      await expect(service.processPushJob(jobDataWithoutToken)).rejects.toThrow(
        'Push token not found for user_id: 123',
      );
      expect(fcmService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('should throw error when template content is missing', async () => {
      // Arrange
      const jobDataWithoutTemplate: PushJobData = {
        ...mockJobData,
        template_content: '',
      };

      // Act & Assert
      await expect(service.processPushJob(jobDataWithoutTemplate)).rejects.toThrow(
        'Template content not provided for template_id: welcome-push',
      );
      expect(fcmService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('should handle plain text template content', async () => {
      // Arrange
      const jobDataWithPlainText: PushJobData = {
        ...mockJobData,
        template_content: 'Simple notification message',
      };
      fcmService.sendPushNotification.mockResolvedValueOnce('message-id-123');

      // Act
      const result = await service.processPushJob(jobDataWithPlainText);

      // Assert
      expect(result).toBe(true);
      expect(fcmService.sendPushNotification).toHaveBeenCalledWith(
        'test-push-token-123',
        {
          title: 'Notification',
          body: 'Simple notification message',
        },
      );
    });

    it('should substitute variables in JSON template', async () => {
      // Arrange
      const jobDataWithVariables: PushJobData = {
        ...mockJobData,
        template_content: JSON.stringify({
          title: 'Hello {{name}}, your order {{order_id}} is ready!',
          body: 'Visit {{link}} to track your order',
        }),
        variables: {
          name: 'Jane Doe',
          order_id: 'ORD-12345',
          link: 'orders',
        },
      };
      fcmService.sendPushNotification.mockResolvedValueOnce('message-id-123');

      // Act
      await service.processPushJob(jobDataWithVariables);

      // Assert
      expect(fcmService.sendPushNotification).toHaveBeenCalledWith(
        'test-push-token-123',
        {
          title: 'Hello Jane Doe, your order ORD-12345 is ready!',
          body: 'Visit orders to track your order',
        },
      );
    });

    it('should handle template with image and link', async () => {
      // Arrange
      const jobDataWithRichContent: PushJobData = {
        ...mockJobData,
        template_content: JSON.stringify({
          title: 'New Message',
          body: 'You have a new message from {{sender}}',
          image: 'https://example.com/image.png',
          link: 'https://example.com/messages/{{message_id}}',
        }),
        variables: {
          sender: 'John',
          message_id: '123',
        },
      };
      fcmService.sendPushNotification.mockResolvedValueOnce('message-id-123');

      // Act
      await service.processPushJob(jobDataWithRichContent);

      // Assert
      expect(fcmService.sendPushNotification).toHaveBeenCalledWith(
        'test-push-token-123',
        {
          title: 'New Message',
          body: 'You have a new message from John',
          image: 'https://example.com/image.png',
          link: 'https://example.com/messages/123',
        },
      );
    });

    it('should handle partial variable substitution', async () => {
      // Arrange
      const jobDataWithPartialVariables: PushJobData = {
        ...mockJobData,
        template_content: JSON.stringify({
          title: 'Hello {{name}}, your order {{order_id}} is ready!',
          body: 'Visit {{link}}',
        }),
        variables: {
          name: 'John Doe',
          // order_id and link are missing
        },
      };
      fcmService.sendPushNotification.mockResolvedValueOnce('message-id-123');

      // Act
      await service.processPushJob(jobDataWithPartialVariables);

      // Assert
      expect(fcmService.sendPushNotification).toHaveBeenCalledWith(
        'test-push-token-123',
        {
          title: 'Hello John Doe, your order {{order_id}} is ready!',
          body: 'Visit {{link}}',
        },
      );
    });

    it('should handle template without variables', async () => {
      // Arrange
      const jobDataWithoutVariables: PushJobData = {
        ...mockJobData,
        template_content: JSON.stringify({
          title: 'Hello',
          body: 'Welcome to our service!',
        }),
        variables: undefined,
      };
      fcmService.sendPushNotification.mockResolvedValueOnce('message-id-123');

      // Act
      const result = await service.processPushJob(jobDataWithoutVariables);

      // Assert
      expect(result).toBe(true);
      expect(fcmService.sendPushNotification).toHaveBeenCalledWith(
        'test-push-token-123',
        {
          title: 'Hello',
          body: 'Welcome to our service!',
        },
      );
    });

    it('should throw error when FCM service fails', async () => {
      // Arrange
      const error = new Error('FCM API error');
      fcmService.sendPushNotification.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(service.processPushJob(mockJobData)).rejects.toThrow('FCM API error');
      expect(service['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('Job failed'),
        expect.stringContaining('corr-123'),
        expect.anything(),
      );
    });

    it('should handle invalid JSON template gracefully', async () => {
      // Arrange
      const jobDataWithInvalidJson: PushJobData = {
        ...mockJobData,
        template_content: 'Invalid JSON {',
      };
      fcmService.sendPushNotification.mockResolvedValueOnce('message-id-123');

      // Act
      const result = await service.processPushJob(jobDataWithInvalidJson);

      // Assert
      expect(result).toBe(true);
      expect(fcmService.sendPushNotification).toHaveBeenCalledWith(
        'test-push-token-123',
        {
          title: 'Notification',
          body: 'Invalid JSON {',
        },
      );
    });

    it('should handle numeric and boolean variables', async () => {
      // Arrange
      const jobDataWithMixedTypes: PushJobData = {
        ...mockJobData,
        template_content: JSON.stringify({
          title: 'Order {{order_id}}',
          body: 'Amount: {{amount}}, Status: {{is_active}}',
        }),
        variables: {
          order_id: 12345,
          amount: 99.99,
          is_active: true,
        },
      };
      fcmService.sendPushNotification.mockResolvedValueOnce('message-id-123');

      // Act
      await service.processPushJob(jobDataWithMixedTypes);

      // Assert
      expect(fcmService.sendPushNotification).toHaveBeenCalledWith(
        'test-push-token-123',
        {
          title: 'Order 12345',
          body: 'Amount: 99.99, Status: true',
        },
      );
    });

    it('should log job received', async () => {
      // Arrange
      fcmService.sendPushNotification.mockResolvedValueOnce('message-id-123');

      // Act
      await service.processPushJob(mockJobData);

      // Assert
      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('Received push job: corr-123'),
      );
    });
  });
});

