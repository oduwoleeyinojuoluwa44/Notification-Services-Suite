import { Test, TestingModule } from '@nestjs/testing';
import { FcmService } from './fcm.service';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

// Mock firebase-admin
jest.mock('firebase-admin', () => {
  const mockMessaging = {
    send: jest.fn(),
  };

  const mockApp = {
    messaging: jest.fn(() => mockMessaging),
  };

  return {
    initializeApp: jest.fn(() => mockApp),
    credential: {
      cert: jest.fn(),
    },
    messaging: jest.fn(() => mockMessaging),
  };
});

describe('FcmService', () => {
  let service: FcmService;
  let configService: jest.Mocked<ConfigService>;
  const mockAdmin = admin as jest.Mocked<typeof admin>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FcmService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<FcmService>(FcmService);
    configService = module.get(ConfigService);

    // Mock logger methods
    jest.spyOn(service['logger'], 'log').mockImplementation();
    jest.spyOn(service['logger'], 'error').mockImplementation();
    jest.spyOn(service['logger'], 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize Firebase with service account path', () => {
      // Arrange
      const mockServiceAccount = {
        projectId: 'test-project',
        privateKey: 'test-key',
        clientEmail: 'test@example.com',
      };
      configService.get.mockReturnValueOnce('/path/to/service-account.json');
      jest.doMock('/path/to/service-account.json', () => mockServiceAccount, { virtual: true });

      // Act
      service.onModuleInit();

      // Assert
      expect(configService.get).toHaveBeenCalledWith('FCM_SERVICE_ACCOUNT_PATH');
      expect(admin.initializeApp).toHaveBeenCalled();
      expect(service['logger'].log).toHaveBeenCalledWith(
        'Firebase Admin initialized successfully',
      );
    });

    it('should initialize Firebase with environment variables', () => {
      // Arrange
      configService.get.mockReturnValueOnce(undefined);
      configService.getOrThrow
        .mockReturnValueOnce('test-project-id')
        .mockReturnValueOnce('test-private-key')
        .mockReturnValueOnce('test@example.com');

      // Act
      service.onModuleInit();

      // Assert
      expect(configService.get).toHaveBeenCalledWith('FCM_SERVICE_ACCOUNT_PATH');
      expect(configService.getOrThrow).toHaveBeenCalledWith('FCM_PROJECT_ID');
      expect(configService.getOrThrow).toHaveBeenCalledWith('FCM_PRIVATE_KEY');
      expect(configService.getOrThrow).toHaveBeenCalledWith('FCM_CLIENT_EMAIL');
      expect(admin.initializeApp).toHaveBeenCalled();
    });

    it('should handle private key with escaped newlines', () => {
      // Arrange
      configService.get.mockReturnValueOnce(undefined);
      configService.getOrThrow
        .mockReturnValueOnce('test-project-id')
        .mockReturnValueOnce('test\\nprivate\\nkey')
        .mockReturnValueOnce('test@example.com');

      // Act
      service.onModuleInit();

      // Assert
      expect(admin.credential.cert).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        privateKey: 'test\nprivate\nkey',
        clientEmail: 'test@example.com',
      });
    });

    it('should throw error if Firebase initialization fails', () => {
      // Arrange
      configService.get.mockReturnValueOnce(undefined);
      configService.getOrThrow.mockImplementation(() => {
        throw new Error('Config error');
      });

      // Act & Assert
      expect(() => service.onModuleInit()).toThrow();
      expect(service['logger'].error).toHaveBeenCalledWith(
        'Failed to initialize Firebase Admin',
        expect.any(Error),
      );
    });
  });

  describe('sendPushNotification', () => {
    beforeEach(() => {
      // Mock firebase app initialization
      const mockMessaging = {
        send: jest.fn(),
      };
      service['firebaseApp'] = {
        messaging: jest.fn(() => mockMessaging),
      } as any;
    });

    it('should send push notification successfully', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      mockMessaging.send.mockResolvedValueOnce('message-id-123');
      const payload = {
        title: 'Test Title',
        body: 'Test Body',
        image: 'https://example.com/image.png',
        link: 'https://example.com',
        data: { key: 'value' },
      };

      // Act
      const result = await service.sendPushNotification('test-token', payload);

      // Assert
      expect(result).toBe('message-id-123');
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'test-token',
          notification: {
            title: 'Test Title',
            body: 'Test Body',
            imageUrl: 'https://example.com/image.png',
          },
          data: {
            key: 'value',
            link: 'https://example.com',
          },
          android: expect.any(Object),
          apns: expect.any(Object),
          webpush: expect.any(Object),
        }),
      );
      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('Push notification sent successfully'),
      );
    });

    it('should send notification without optional fields', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      mockMessaging.send.mockResolvedValueOnce('message-id-123');
      const payload = {
        title: 'Test Title',
        body: 'Test Body',
      };

      // Act
      await service.sendPushNotification('test-token', payload);

      // Assert
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'test-token',
          notification: {
            title: 'Test Title',
            body: 'Test Body',
            imageUrl: undefined,
          },
          data: {},
        }),
      );
    });

    it('should throw error when FCM send fails', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      const error = new Error('FCM send failed');
      mockMessaging.send.mockRejectedValueOnce(error);
      const payload = {
        title: 'Test Title',
        body: 'Test Body',
      };

      // Act & Assert
      await expect(
        service.sendPushNotification('test-token', payload),
      ).rejects.toThrow('FCM send failed');
      expect(service['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send push notification'),
        error,
      );
    });

    it('should include link in data when provided', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      mockMessaging.send.mockResolvedValueOnce('message-id-123');
      const payload = {
        title: 'Test Title',
        body: 'Test Body',
        link: 'https://example.com/page',
      };

      // Act
      await service.sendPushNotification('test-token', payload);

      // Assert
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            link: 'https://example.com/page',
          },
        }),
      );
    });

    it('should configure Android notification correctly', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      mockMessaging.send.mockResolvedValueOnce('message-id-123');
      const payload = {
        title: 'Test Title',
        body: 'Test Body',
      };

      // Act
      await service.sendPushNotification('test-token', payload);

      // Assert
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'default',
            },
          },
        }),
      );
    });

    it('should configure APNS notification correctly', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      mockMessaging.send.mockResolvedValueOnce('message-id-123');
      const payload = {
        title: 'Test Title',
        body: 'Test Body',
      };

      // Act
      await service.sendPushNotification('test-token', payload);

      // Assert
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        }),
      );
    });
  });

  describe('validateToken', () => {
    beforeEach(() => {
      // Mock firebase app initialization
      const mockMessaging = {
        send: jest.fn(),
      };
      service['firebaseApp'] = {
        messaging: jest.fn(() => mockMessaging),
      } as any;
    });

    it('should return true for valid token', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      mockMessaging.send.mockResolvedValueOnce('valid');

      // Act
      const result = await service.validateToken('valid-token');

      // Assert
      expect(result).toBe(true);
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'valid-token',
        }),
        true, // dry run
      );
    });

    it('should return false for invalid registration token', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      const error: any = new Error('Invalid token');
      error.code = 'messaging/invalid-registration-token';
      mockMessaging.send.mockRejectedValueOnce(error);

      // Act
      const result = await service.validateToken('invalid-token');

      // Assert
      expect(result).toBe(false);
      expect(service['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid push token detected'),
      );
    });

    it('should return false for unregistered token', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      const error: any = new Error('Token not registered');
      error.code = 'messaging/registration-token-not-registered';
      mockMessaging.send.mockRejectedValueOnce(error);

      // Act
      const result = await service.validateToken('unregistered-token');

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for other errors (assume valid)', async () => {
      // Arrange
      const mockMessaging = service['firebaseApp'].messaging() as any;
      const error: any = new Error('Network error');
      error.code = 'messaging/network-error';
      mockMessaging.send.mockRejectedValueOnce(error);

      // Act
      const result = await service.validateToken('token');

      // Assert
      expect(result).toBe(true);
      expect(service['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('Token validation error'),
      );
    });
  });
});

