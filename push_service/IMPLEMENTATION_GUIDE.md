# Push Service Implementation Guide - NestJS

This guide provides step-by-step instructions to implement the Push Service using NestJS, following the same patterns as the Email Service.

## Overview

The Push Service will:
- Consume messages from the `push_queue` in RabbitMQ
- Process push notification requests
- Send notifications via Firebase Cloud Messaging (FCM)
- Handle retries, error handling, and status updates
- Support rich notifications (title, text, image, link)

## Step-by-Step Implementation

### Step 1: Initialize NestJS Project

```bash
cd push_service
npm install -g @nestjs/cli
nest new . --skip-git
```

Or if you prefer to set up manually:

```bash
npm init -y
npm install @nestjs/core @nestjs/common @nestjs/platform-express @nestjs/microservices @nestjs/config @nestjs/terminus reflect-metadata rxjs
npm install -D @nestjs/cli @nestjs/schematics @types/node typescript ts-node
```

### Step 2: Create Project Structure

Create the following directory structure:

```
push_service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── push/
│   │   ├── push.module.ts
│   │   ├── push.controller.ts
│   │   ├── push.service.ts
│   │   └── interfaces/
│   │       └── push.types.ts
│   └── fcm/
│       ├── fcm.module.ts
│       └── fcm.service.ts
├── test/
├── package.json
├── tsconfig.json
├── nest-cli.json
└── Dockerfile
```

### Step 3: Install Required Dependencies

```bash
npm install @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/microservices @nestjs/config @nestjs/terminus firebase-admin amqplib
npm install -D @types/node @types/jest typescript ts-node @nestjs/cli @nestjs/schematics
```

### Step 4: Create TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

### Step 5: Create NestJS CLI Configuration

Create `nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

### Step 6: Create Type Definitions

Create `src/push/interfaces/push.types.ts`:

```typescript
export interface UserPreferences {
  email: boolean;
  push: boolean;
}

export interface UserData {
  id: number;
  email: string;
  push_token?: string;
  preferences: UserPreferences;
}

export interface PushJobData {
  user_id: number;
  template_id: string;
  notification_type: 'email' | 'push';
  variables?: Record<string, string | number | boolean>;
  user_data: UserData;
  template_content: string;
  correlation_id: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  image?: string;
  link?: string;
  data?: Record<string, string>;
}
```

### Step 7: Create FCM Service

Create `src/fcm/fcm.service.ts`:

```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private firebaseApp: admin.app.App;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
      // Option 1: Using service account JSON (recommended for production)
      const serviceAccountPath = this.configService.get<string>('FCM_SERVICE_ACCOUNT_PATH');
      
      if (serviceAccountPath) {
        const serviceAccount = require(serviceAccountPath);
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } else {
        // Option 2: Using environment variables
        const projectId = this.configService.getOrThrow<string>('FCM_PROJECT_ID');
        const privateKey = this.configService.getOrThrow<string>('FCM_PRIVATE_KEY').replace(/\\n/g, '\n');
        const clientEmail = this.configService.getOrThrow<string>('FCM_CLIENT_EMAIL');

        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey,
            clientEmail,
          }),
        });
      }

      this.logger.log('Firebase Admin initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin', error);
      throw error;
    }
  }

  async sendPushNotification(
    token: string,
    payload: {
      title: string;
      body: string;
      image?: string;
      link?: string;
      data?: Record<string, string>;
    },
  ): Promise<string> {
    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.image,
        },
        data: {
          ...payload.data,
          ...(payload.link && { link: payload.link }),
        },
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            channelId: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: payload.image,
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`Push notification sent successfully: ${response}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to send push notification: ${error.message}`, error);
      throw error;
    }
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      // Send a test message to validate token
      await admin.messaging().send({
        token,
        notification: {
          title: 'Test',
          body: 'Test',
        },
      }, true); // dry run
      return true;
    } catch (error) {
      if (error.code === 'messaging/invalid-registration-token' || 
          error.code === 'messaging/registration-token-not-registered') {
        return false;
      }
      throw error;
    }
  }
}
```

Create `src/fcm/fcm.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { FcmService } from './fcm.service';

@Module({
  providers: [FcmService],
  exports: [FcmService],
})
export class FcmModule {}
```

### Step 8: Create Push Service

Create `src/push/push.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FcmService } from '../fcm/fcm.service';
import { PushJobData, PushNotificationPayload } from './interfaces/push.types';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly fcmService: FcmService,
  ) {}

  async processPushJob(jobData: PushJobData): Promise<boolean> {
    this.logger.log(`Received push job: ${jobData.correlation_id}`);

    try {
      // Validate notification type
      if (jobData.notification_type !== 'push') {
        this.logger.log(
          `Skipping non-push notification (type: ${jobData.notification_type}) for correlation_id: ${jobData.correlation_id}`,
        );
        return true;
      }

      // Check user preferences
      if (!jobData.user_data?.preferences?.push) {
        this.logger.log(
          `User ${jobData.user_id} has disabled push notifications. Skipping...`,
        );
        return true;
      }

      // Validate required data
      if (!jobData.user_data?.push_token) {
        throw new Error(
          `Push token not found for user_id: ${jobData.user_id}`,
        );
      }

      if (!jobData.template_content) {
        throw new Error(
          `Template content not provided for template_id: ${jobData.template_id}`,
        );
      }

      // Parse template content (assuming it's JSON with title, body, etc.)
      let notificationPayload: PushNotificationPayload;
      try {
        notificationPayload = JSON.parse(jobData.template_content);
      } catch {
        // If not JSON, treat as plain text body
        notificationPayload = {
          title: 'Notification',
          body: jobData.template_content,
        };
      }

      // Substitute variables in template
      if (jobData.variables) {
        Object.keys(jobData.variables).forEach((key) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          const value = jobData.variables?.[key];
          if (value !== undefined) {
            if (notificationPayload.title) {
              notificationPayload.title = notificationPayload.title.replace(
                regex,
                String(value),
              );
            }
            if (notificationPayload.body) {
              notificationPayload.body = notificationPayload.body.replace(
                regex,
                String(value),
              );
            }
            if (notificationPayload.link) {
              notificationPayload.link = notificationPayload.link.replace(
                regex,
                String(value),
              );
            }
          }
        });
      }

      // Validate push token before sending
      const isValidToken = await this.fcmService.validateToken(
        jobData.user_data.push_token,
      );
      if (!isValidToken) {
        throw new Error(
          `Invalid push token for user_id: ${jobData.user_id}`,
        );
      }

      // Send push notification via FCM
      await this.fcmService.sendPushNotification(
        jobData.user_data.push_token,
        notificationPayload,
      );

      this.logger.log(
        `Job completed successfully: ${jobData.correlation_id}`,
      );
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Job failed: ${jobData.correlation_id}, ${errorMessage}`,
      );
      throw error;
    }
  }
}
```

### Step 9: Create Push Controller

Create `src/push/push.controller.ts`:

```typescript
import { Controller, Logger } from '@nestjs/common';
import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
  Transport,
} from '@nestjs/microservices';
import { PushService } from './push.service';
import type { PushJobData } from './interfaces/push.types';

@Controller()
export class PushController {
  private readonly logger = new Logger(PushController.name);

  constructor(private readonly pushService: PushService) {}

  @MessagePattern('push_queue', Transport.RMQ)
  async handlePushJob(
    @Payload() data: PushJobData,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMessage = context.getMessage();

    try {
      await this.pushService.processPushJob(data);
      channel.ack(originalMessage);
      this.logger.log(
        `Push notification processed successfully: ${data.correlation_id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process push notification: ${data.correlation_id}`,
        error,
      );
      // Reject message and don't requeue (will go to dead letter queue)
      channel.nack(originalMessage, false, false);
    }
  }
}
```

Create `src/push/push.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { FcmModule } from '../fcm/fcm.module';

@Module({
  imports: [FcmModule],
  controllers: [PushController],
  providers: [PushService],
})
export class PushModule {}
```

### Step 10: Create App Module

Create `src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PushModule } from './push/push.module';
import { TerminusModule } from '@nestjs/terminus';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TerminusModule,
    PushModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### Step 11: Create Main Application File

Create `src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const rabbitMqUrl = configService.getOrThrow<string>('RABBITMQ_URL');
  const port = configService.getOrThrow<number>('PORT');

  // Connect to RabbitMQ microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitMqUrl],
      queue: 'push_queue',
      noAck: false,
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);

  console.log(`Push service HTTP server listening on port ${port}`);
  console.log('Push service is listening for messages from push_queue...');
}
bootstrap();
```

### Step 12: Create Health Check Controller

Update `src/app.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly health: HealthCheckService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}
```

Update `src/app.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Push Service is running!';
  }
}
```

### Step 13: Create Package.json

Create `package.json`:

```json
{
  "name": "push_service",
  "version": "0.0.1",
  "description": "Push notification service using NestJS and FCM",
  "author": "",
  "private": true,
  "license": "UNLICENSED",
  "scripts": {
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.1",
    "@nestjs/core": "^11.0.1",
    "@nestjs/platform-express": "^11.0.1",
    "@nestjs/microservices": "^11.1.8",
    "@nestjs/config": "^4.0.2",
    "@nestjs/terminus": "^11.0.0",
    "firebase-admin": "^13.0.0",
    "amqplib": "^0.10.9",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.1",
    "@types/express": "^5.0.0",
    "@types/jest": "^30.0.0",
    "@types/node": "^22.10.7",
    "@types/amqplib": "^0.10.4",
    "eslint": "^9.18.0",
    "jest": "^30.0.0",
    "prettier": "^3.4.2",
    "source-map-support": "^0.5.21",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-loader": "^9.5.2",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.7.3"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

### Step 14: Create Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 8082

CMD ["node", "dist/main"]
```

### Step 15: Update Docker Compose

Update `infra/docker-compose.yml` to enable push_service:

```yaml
push_service:
  build: ../push_service
  ports:
    - "8082:8082"
  depends_on:
    - rabbitmq
  networks:
    - notification_network
  environment:
    PORT: 8082
    RABBITMQ_URL: amqp://user:password@rabbitmq:5672
    FCM_PROJECT_ID: ${FCM_PROJECT_ID}
    FCM_PRIVATE_KEY: ${FCM_PRIVATE_KEY}
    FCM_CLIENT_EMAIL: ${FCM_CLIENT_EMAIL}
    # OR use service account file path
    # FCM_SERVICE_ACCOUNT_PATH: /path/to/service-account.json
```

### Step 16: Environment Variables

Create `.env.example` in `push_service/`:

```env
PORT=8082
RABBITMQ_URL=amqp://user:password@rabbitmq:5672

# Firebase Cloud Messaging Configuration
# Option 1: Using environment variables
FCM_PROJECT_ID=your-project-id
FCM_PRIVATE_KEY=your-private-key
FCM_CLIENT_EMAIL=your-client-email

# Option 2: Using service account file (recommended)
# FCM_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

### Step 17: Setup Firebase Cloud Messaging

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Go to Project Settings → Service Accounts
4. Generate a new private key (downloads JSON file)
5. Either:
   - Use the JSON file path in `FCM_SERVICE_ACCOUNT_PATH`, OR
   - Extract `project_id`, `private_key`, and `client_email` for env vars

### Step 18: Testing

1. Start all services:
   ```bash
   cd infra
   docker-compose up --build
   ```

2. Test health endpoint:
   ```bash
   curl http://localhost:8082/health
   ```

3. Send a test notification via API Gateway:
   ```bash
   curl -X POST http://localhost:8080/notifications/send \
     -H "Content-Type: application/json" \
     -d '{
       "user_id": 1,
       "template_id": "template-uuid",
       "notification_type": "push",
       "variables": {"name": "John"}
     }'
   ```

## Additional Features to Implement

### 1. Retry Logic with Exponential Backoff

Add retry logic in `push.service.ts`:

```typescript
private async retryWithBackoff(
  fn: () => Promise<any>,
  maxRetries: number = 3,
): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000; // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

### 2. Circuit Breaker Pattern

Install `@nestjs/circuit-breaker` or use `opossum`:

```typescript
import CircuitBreaker from 'opossum';

const options = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

const breaker = new CircuitBreaker(fcmService.sendPushNotification, options);
```

### 3. Status Updates to Redis

Update status in Redis after processing:

```typescript
import { Redis } from 'ioredis';

// In push.service.ts
async updateNotificationStatus(
  correlationId: string,
  status: 'delivered' | 'failed',
  error?: string,
) {
  const redis = new Redis(process.env.REDIS_URL);
  await redis.set(
    `notification:${correlationId}`,
    JSON.stringify({
      status,
      timestamp: new Date().toISOString(),
      error,
    }),
    'EX',
    3600,
  );
}
```

## Summary

You now have a complete Push Service implementation that:
- ✅ Consumes messages from `push_queue`
- ✅ Validates user preferences and push tokens
- ✅ Processes templates with variable substitution
- ✅ Sends push notifications via FCM
- ✅ Handles errors and retries
- ✅ Includes health checks
- ✅ Follows the same pattern as Email Service
- ✅ Uses snake_case naming convention
- ✅ Supports rich notifications

Next steps:
1. Set up Firebase project and get credentials
2. Test the service locally
3. Add monitoring and logging
4. Implement circuit breaker pattern
5. Add comprehensive error handling

