# Notification Services Suite - Interaction Flow Documentation

This document explains how the **Frontend**, **API Gateway**, and **User Service** interact, and the complete flow from frontend request to email/push notification delivery.

## 🏗️ Architecture Overview

```
┌─────────────┐
│  Frontend   │ (React/Vue/Angular/Any HTTP Client)
└──────┬──────┘
       │ HTTP/REST
       │ (POST /notifications/send)
       ▼
┌─────────────────────────────────────┐
│         API Gateway                 │ (Node.js/Fastify)
│  - Port: 3000 (default)              │
│  - Authentication & Authorization   │
│  - Request Validation               │
│  - Service Orchestration            │
└──────┬──────────────────────────────┘
       │
       ├─────────────────┬─────────────────┐
       │                 │                 │
       │ HTTP/REST       │ HTTP/REST       │ RabbitMQ
       ▼                 ▼                 ▼
┌─────────────┐  ┌──────────────┐  ┌─────────────┐
│User Service │  │Template      │  │  RabbitMQ   │
│(Python/     │  │Service        │  │  Message    │
│ FastAPI)    │  │(Node.js)      │  │  Queue      │
│ Port: 8000  │  │ Port: 8084    │  │             │
└─────────────┘  └──────────────┘  └──────┬──────┘
                                           │
                           ┌───────────────┴───────────────┐
                           │                               │
                           ▼                               ▼
                    ┌─────────────┐              ┌─────────────┐
                    │Email Service │              │Push Service │
                    │(NestJS)      │              │(NestJS)     │
                    │Consumes:     │              │Consumes:    │
                    │email_queue   │              │push_queue   │
                    └──────┬───────┘              └──────┬──────┘
                           │                             │
                           ▼                             ▼
                    ┌─────────────┐              ┌─────────────┐
                    │  SendGrid   │              │  Firebase   │
                    │  (Email)    │              │  Cloud      │
                    │             │              │  Messaging  │
                    └─────────────┘              └─────────────┘
```

---

## 🔄 Complete Notification Flow

### Step-by-Step Flow (Email Example)

#### 1. **Frontend → API Gateway**

**Frontend makes HTTP request:**
```javascript
// Frontend code example
const response = await fetch('http://api-gateway:3000/notifications/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <JWT_TOKEN>',  // Required (unless SKIP_AUTH=true)
    'x-correlation-id': '<optional-correlation-id>'
  },
  body: JSON.stringify({
    user_id: "123e4567-e89b-12d3-a456-426614174000",
    template_id: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    notification_type: "email",  // or "push"
    variables: {
      name: "John Doe",
      product: "Awesome Product",
      discount: "20%"
    }
  })
});

// Response (202 Accepted):
{
  "success": true,
  "data": {
    "notification_id": "correlation-id-uuid",
    "status": "accepted",
    "routing_key": "email"
  },
  "message": "Notification request accepted and queued for processing."
}
```

**API Gateway Processing:**
- ✅ **Authentication Middleware**: Validates JWT token (unless `SKIP_AUTH=true`)
- ✅ **Correlation ID**: Generates/uses correlation ID for request tracking
- ✅ **Request Validation**: Validates request body schema
- ✅ **Rate Limiting**: Checks rate limits (100 requests/minute default)

#### 2. **API Gateway → User Service**

**API Gateway fetches user data:**
```javascript
// Inside notification.handler.js
const userResponse = await fetch(
  `${config.USER_SERVICE_URL}/api/v1/users/${user_id}`,
  {
    headers: { 
      'x-correlation-id': correlationId 
    }
  }
);
```

**User Service Endpoint:**
- **Endpoint**: `GET /api/v1/users/{user_id}`
- **Response**: 
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "push_token": "device-token-123",  // For push notifications
    "is_active": true,
    "preferences": {
      "email_enabled": true,
      "push_enabled": false
    }
  }
}
```

**Why API Gateway calls User Service:**
- To get user's email address (for email notifications)
- To get user's push token (for push notifications)
- To check user's notification preferences
- To validate user exists and is active

#### 3. **API Gateway → Template Service**

**API Gateway fetches template:**
```javascript
const templateResponse = await fetch(
  `${config.TEMPLATE_SERVICE_URL}/templates/${template_id}?variables=${JSON.stringify(variables)}`
);
```

**Template Service Response:**
- Returns template content with variable placeholders
- Example: `"Hello {{name}}, you have a {{discount}} discount on {{product}}!"`

#### 4. **API Gateway → Redis (Status Tracking)**

**API Gateway stores notification status:**
```javascript
// Store initial status
await redis.set(
  `notification:${correlationId}`, 
  JSON.stringify({
    notification_id: correlationId,
    user_id: user_id,
    template_id: template_id,
    notification_type: "email",
    status: "PENDING",  // → "QUEUED" → "SENT" → "FAILED"
    timestamp: new Date().toISOString(),
    details: "Notification request received..."
  }),
  'EX', 3600  // Expires in 1 hour
);
```

#### 5. **API Gateway → RabbitMQ**

**API Gateway publishes message to queue:**
```javascript
// Determine queue based on notification_type
const routingKey = notification_type === 'email' ? 'email' : 'push';
const queueName = routingKey === 'email' ? 'email_queue' : 'push_queue';

// Message payload
const message = {
  user_id: user_id,
  template_id: template_id,
  notification_type: "email",
  variables: variables,
  user_data: userData,        // From User Service
  template_content: templateData.content,  // From Template Service
  correlation_id: correlationId
};

// Publish to RabbitMQ
await publishToQueue(routingKey, message);
```

**RabbitMQ Queues:**
- `email_queue`: For email notifications (consumed by Email Service)
- `push_queue`: For push notifications (consumed by Push Service)

#### 6. **RabbitMQ → Email Service / Push Service**

**Email Service consumes from `email_queue`:**
```typescript
// email.controller.ts
@MessagePattern('email_queue', Transport.RMQ)
async handleEmailJob(@Payload() data: EmailJobData) {
  await this.emailService.processEmailJob(data);
}
```

**Email Service Processing:**
1. ✅ Validates notification type is "email"
2. ✅ Checks user preferences (`email_enabled`)
3. ✅ Validates user email exists
4. ✅ Substitutes variables in template: `{{name}}` → "John Doe"
5. ✅ Sends email via SendGrid

**Push Service consumes from `push_queue`:**
```typescript
// push.controller.ts
@MessagePattern('push_queue', Transport.RMQ)
async handlePushJob(@Payload() data: PushJobData) {
  await this.pushService.processPushJob(data);
}
```

**Push Service Processing:**
1. ✅ Validates notification type is "push"
2. ✅ Checks user preferences (`push_enabled`)
3. ✅ Validates push token exists
4. ✅ Substitutes variables in template
5. ✅ Sends push notification via Firebase Cloud Messaging (FCM)

#### 7. **Email/Push Service → External Providers**

**Email Service → SendGrid:**
```typescript
await sendgridService.sendEmail({
  to: userData.email,
  from: 'noreply@example.com',
  subject: 'Notification',
  html: finalContent  // Template with variables substituted
});
```

**Push Service → Firebase Cloud Messaging:**
```typescript
await fcmService.sendPushNotification(
  userData.push_token,
  {
    title: "Notification",
    body: "Hello John Doe, you have a 20% discount on Awesome Product!",
    link: "https://example.com/product"
  }
);
```

#### 8. **Frontend → API Gateway (Status Check)**

**Frontend can check notification status:**
```javascript
const statusResponse = await fetch(
  `http://api-gateway:3000/notifications/${notification_id}/status`
);

// Response:
{
  "success": true,
  "data": {
    "notification_id": "correlation-id-uuid",
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "template_id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    "notification_type": "email",
    "status": "QUEUED",  // PENDING → QUEUED → SENT → FAILED
    "timestamp": "2025-11-13T10:00:00Z",
    "details": "Notification message published to RabbitMQ."
  }
}
```

**Status is retrieved from Redis** (stored by API Gateway)

---

## 🔗 API Gateway ↔ User Service Interaction

### When API Gateway Calls User Service

1. **During Notification Request** (`POST /notifications/send`):
   - **Endpoint**: `GET /api/v1/users/{user_id}`
   - **Purpose**: Fetch user data (email, push_token, preferences)
   - **Method**: Synchronous HTTP GET request
   - **Headers**: Includes `x-correlation-id` for request tracking

### User Service Endpoints Available

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/users/` | POST | Create new user |
| `/api/v1/users/{user_id}` | GET | Get user by ID (used by API Gateway) |
| `/api/v1/users/email/{email}` | GET | Get user by email |
| `/api/v1/users/preferences/{user_id}` | GET | Get user notification preferences |
| `/api/v1/users/preferences/{user_id}` | PUT | Update user preferences |
| `/api/v1/users/update-push-token/{user_id}` | PUT | Update push notification token |
| `/api/v1/users/verify-password` | POST | Verify user password (authentication) |
| `/api/v1/users/update-password/{user_id}` | PUT | Update user password |
| `/api/v1/users/all/users` | GET | Get all users (paginated) |

### Communication Protocol

- **Protocol**: HTTP/REST (synchronous)
- **Base URL**: Configured via `USER_SERVICE_URL` environment variable
- **Default**: `http://user_service:8081` (Docker) or `http://localhost:8000` (local)
- **Response Format**: JSON with standardized `APIResponse` structure

---

## 🌐 Frontend → API Gateway Interaction

### API Gateway Endpoints

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/notifications/send` | POST | Send notification | ✅ Yes (JWT) |
| `/notifications/{notification_id}/status` | GET | Get notification status | ✅ Yes (JWT) |
| `/health` | GET | Health check | ❌ No |

### Authentication

**JWT Token Required** (unless `SKIP_AUTH=true`):
```javascript
headers: {
  'Authorization': 'Bearer <JWT_TOKEN>'
}
```

**Token Validation:**
- API Gateway validates JWT using `JWT_SECRET`
- Decoded user info attached to request as `request.user`
- Invalid/expired tokens return `401 Unauthorized`

### Request/Response Examples

**Send Notification:**
```javascript
POST /notifications/send
Content-Type: application/json
Authorization: Bearer <token>

{
  "user_id": "uuid",
  "template_id": "uuid",
  "notification_type": "email",
  "variables": {
    "name": "John",
    "product": "Product Name"
  }
}

// Response: 202 Accepted
{
  "success": true,
  "data": {
    "notification_id": "correlation-id",
    "status": "accepted",
    "routing_key": "email"
  }
}
```

**Check Status:**
```javascript
GET /notifications/{notification_id}/status
Authorization: Bearer <token>

// Response: 200 OK
{
  "success": true,
  "data": {
    "notification_id": "correlation-id",
    "status": "QUEUED",
    "timestamp": "2025-11-13T10:00:00Z",
    "details": "..."
  }
}
```

---

## 📊 Data Flow Diagram

```
┌──────────────┐
│   Frontend   │
└──────┬───────┘
       │ 1. POST /notifications/send
       │    {user_id, template_id, notification_type, variables}
       ▼
┌─────────────────────────────────────────────┐
│           API Gateway                       │
│  ┌──────────────────────────────────────┐  │
│  │ 1. Authenticate (JWT)                │  │
│  │ 2. Validate request                  │  │
│  │ 3. Generate correlation_id           │  │
│  │ 4. Store status in Redis (PENDING)   │  │
│  └──────────────────────────────────────┘  │
└──────┬──────────────────────────────────────┘
       │
       ├─── 2. GET /api/v1/users/{user_id} ────┐
       │                                        │
       ├─── 3. GET /templates/{template_id} ───┤
       │                                        │
       │ 4. Publish to RabbitMQ                 │
       │    (email_queue or push_queue)          │
       │                                        │
       ▼                                        ▼
┌──────────────┐                      ┌──────────────┐
│User Service  │                      │Template      │
│              │                      │Service       │
│ Returns:     │                      │Returns:      │
│ - email      │                      │ - content    │
│ - push_token │                      │ - variables  │
│ - preferences│                      │              │
└──────────────┘                      └──────────────┘
       │
       │
       ▼
┌──────────────┐
│  RabbitMQ    │
│  - email_queue│
│  - push_queue │
└──────┬───────┘
       │
       ├─── Consumed by ────┐
       │                     │
       ▼                     ▼
┌──────────────┐    ┌──────────────┐
│Email Service │    │Push Service  │
│              │    │              │
│ 1. Validate  │    │ 1. Validate  │
│ 2. Substitute│    │ 2. Substitute│
│ 3. SendGrid  │    │ 3. FCM       │
└──────┬───────┘    └──────┬───────┘
       │                    │
       ▼                    ▼
┌──────────────┐    ┌──────────────┐
│   SendGrid   │    │   Firebase   │
│   (Email)    │    │   (Push)     │
└──────────────┘    └──────────────┘
       │                    │
       ▼                    ▼
┌──────────────┐    ┌──────────────┐
│   User's     │    │   User's     │
│   Email      │    │   Device     │
│   Inbox      │    │   (Mobile)   │
└──────────────┘    └──────────────┘
```

---

## 🔍 Key Points

### API Gateway Responsibilities
1. **Single Entry Point**: All frontend requests go through API Gateway
2. **Authentication**: Validates JWT tokens
3. **Orchestration**: Coordinates calls to User Service and Template Service
4. **Message Publishing**: Publishes to RabbitMQ queues
5. **Status Tracking**: Stores notification status in Redis
6. **Error Handling**: Returns appropriate HTTP status codes

### User Service Role
1. **User Data Management**: Stores and retrieves user information
2. **Preference Management**: Manages notification preferences
3. **Authentication**: Handles password verification
4. **Push Token Management**: Stores device push tokens

### Asynchronous Processing
- API Gateway returns `202 Accepted` immediately after queuing
- Actual email/push delivery happens asynchronously
- Frontend can poll status endpoint to check delivery status

### Error Handling
- If User Service is unavailable → API Gateway returns error
- If Template Service is unavailable → API Gateway returns error
- If RabbitMQ publish fails → API Gateway returns 500 error
- Failed notifications are tracked in Redis with `FAILED` status

---

## 🧪 Testing the Flow

### 1. Send Email Notification
```bash
curl -X POST http://localhost:3000/notifications/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{
    "user_id": "user-uuid",
    "template_id": "template-uuid",
    "notification_type": "email",
    "variables": {
      "name": "John Doe",
      "product": "Test Product"
    }
  }'
```

### 2. Check Status
```bash
curl -X GET http://localhost:3000/notifications/{notification_id}/status \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### 3. Get User (from User Service)
```bash
curl -X GET http://localhost:8000/api/v1/users/{user_id}
```

---

## 📝 Summary

**Frontend → API Gateway:**
- Frontend sends notification request with JWT authentication
- API Gateway validates and processes request

**API Gateway → User Service:**
- API Gateway fetches user data (email, push_token, preferences)
- Synchronous HTTP REST call

**API Gateway → Template Service:**
- API Gateway fetches template content
- Synchronous HTTP REST call

**API Gateway → RabbitMQ:**
- API Gateway publishes message to appropriate queue
- Asynchronous message queue

**RabbitMQ → Email/Push Services:**
- Services consume messages from queues
- Process and send notifications via external providers

**Result:**
- User receives email via SendGrid
- User receives push notification via Firebase Cloud Messaging

