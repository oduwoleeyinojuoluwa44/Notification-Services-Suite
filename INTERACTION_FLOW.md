# Notification Services Suite - Interaction Flow

## Overview
This document explains how the **Frontend**, **API Gateway**, and **User Service** interact to deliver email notifications to users.

---

## Architecture Flow Diagram

```
┌─────────────┐
│   Frontend  │
│  (Browser)  │
└──────┬──────┘
       │
       │ 1. HTTP POST /notifications/send
       │    Headers: Authorization: Bearer <JWT>
       │    Body: { user_id, template_id, notification_type: "email", variables }
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (Node.js/Fastify)            │
│  Port: 8080                                                  │
│                                                              │
│  1. Receives request                                        │
│  2. Validates JWT token (auth middleware)                   │
│  3. Generates correlation_id                                │
│  4. Stores initial status in Redis                           │
│  5. Fetches user data from User Service                     │
│  6. Fetches template from Template Service                  │
│  7. Publishes message to RabbitMQ                           │
│  8. Returns 202 Accepted with notification_id                │
└──────┬──────────────────────────────────────────────────────┘
       │
       │ 2. HTTP GET /api/v1/users/{user_id}
       │    Headers: x-correlation-id: <uuid>
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                  User Service (Python/FastAPI)              │
│  Port: 8081                                                  │
│                                                              │
│  1. Receives GET request                                    │
│  2. Queries PostgreSQL database                             │
│  3. Returns user data (email, preferences, etc.)            │
└──────┬──────────────────────────────────────────────────────┘
       │
       │ 3. Response: { success: true, data: { id, email, ... } }
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (continued)                   │
│                                                              │
│  4. Fetches template from Template Service                  │
│  5. Constructs message payload                              │
│  6. Publishes to RabbitMQ queue: "email_queue"              │
└──────┬──────────────────────────────────────────────────────┘
       │
       │ 4. RabbitMQ Message
       │    Queue: email_queue
       │    Payload: { user_id, template_id, notification_type,
       │               variables, user_data, template_content,
       │               correlation_id }
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    RabbitMQ Message Queue                   │
│                                                              │
│  Queue: email_queue (durable)                               │
└──────┬──────────────────────────────────────────────────────┘
       │
       │ 5. Consumes message
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│              Email Service (Node.js/NestJS)                 │
│  Port: 3002                                                  │
│                                                              │
│  1. Consumes message from email_queue                       │
│  2. Validates notification_type = "email"                  │
│  3. Checks user preferences (email_enabled)                │
│  4. Substitutes variables in template                      │
│  5. Sends email via SendGrid                                │
└──────┬──────────────────────────────────────────────────────┘
       │
       │ 6. HTTP POST to SendGrid API
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    SendGrid (External)                      │
│                                                              │
│  Delivers email to user's inbox                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Step-by-Step Flow

### Step 1: Frontend → API Gateway

**Frontend Request:**
```javascript
// Frontend makes HTTP request
POST http://api-gateway:8080/notifications/send
Headers:
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json
Body:
{
  "user_id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "template_id": "template-uuid-123",
  "notification_type": "email",
  "variables": {
    "name": "John Doe",
    "product": "Awesome Product"
  }
}
```

**API Gateway Processing:**
- **Authentication Middleware** (`auth.middleware.js`): Validates JWT token
- **Correlation ID Middleware**: Generates/uses correlation ID for request tracking
- **Route Handler** (`notification.handler.js`): Processes the request

### Step 2: API Gateway → User Service

**API Gateway makes internal HTTP call:**
```javascript
// From notification.handler.js line 29
const userResponse = await fetch(
  `${config.USER_SERVICE_URL}/api/v1/users/${user_id}`,
  {
    headers: { 
      [config.CORRELATION_ID_HEADER]: correlationId 
    }
  }
);
```

**User Service Endpoint:**
- **Route**: `GET /api/v1/users/{user_id}` (from `users.py` line 62)
- **Handler**: `get_user(user_id, db)`
- **Service Layer**: `UserService.get_user_by_id(db, user_id)` (from `user_service.py` line 51)
- **Database Query**: Queries PostgreSQL for user data
- **Response**: Returns user object with email, preferences, etc.

**User Service Response:**
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "is_active": true,
    "created_at": "2025-11-13T10:00:00Z"
  },
  "message": "User retrieved successfully."
}
```

### Step 3: API Gateway → Template Service

**API Gateway fetches template:**
```javascript
// From notification.handler.js line 46
const templateResponse = await fetch(
  `${config.TEMPLATE_SERVICE_URL}/templates/${template_id}?variables=${JSON.stringify(variables)}`,
  {
    headers: { 
      [config.CORRELATION_ID_HEADER]: correlationId 
    }
  }
);
```

### Step 4: API Gateway → RabbitMQ

**Message Construction:**
```javascript
// From notification.handler.js line 80-88
const message = {
  user_id,
  template_id,
  notification_type: "email",
  variables,
  user_data: userData,        // From User Service
  template_content: templateData.content,  // From Template Service
  correlation_id: correlationId
};
```

**Publishing to RabbitMQ:**
```javascript
// From publisher.js line 3
await publishToQueue('email', message);
// Routes to 'email_queue' (line 12)
```

**RabbitMQ Queue:**
- **Queue Name**: `email_queue`
- **Durability**: `true` (persistent)
- **Message Format**: JSON with pattern matching for NestJS

### Step 5: Email Service Consumes Message

**Email Service Setup:**
- **Framework**: NestJS with RabbitMQ microservice transport
- **Queue**: `email_queue` (from `main.ts` line 17)
- **Controller**: `EmailController.handleEmailJob()` (from `email.controller.ts` line 11)

**Message Pattern:**
```typescript
@MessagePattern('email_queue', Transport.RMQ)
async handleEmailJob(@Payload() data: EmailJobData, @Ctx() context: RmqContext)
```

### Step 6: Email Service Processes & Sends

**Processing Steps** (from `email.service.ts`):

1. **Validate notification type** (line 22): Must be "email"
2. **Check user preferences** (line 28): `user_data.preferences.email` must be true
3. **Validate required data** (line 34-40): Email and template content must exist
4. **Substitute variables** (line 43-52): Replaces `{{variable}}` placeholders
5. **Send via SendGrid** (line 55-60): Calls SendGrid API

**SendGrid Integration:**
```typescript
await this.sendgridService.sendEmail({
  to: jobData.user_data.email,
  from: this.sendgridFromEmail,
  subject: 'Notification',
  html: finalContent,  // Template with variables substituted
});
```

### Step 7: Email Delivery

SendGrid delivers the email to the user's inbox.

---

## Key Components

### API Gateway (`api_gateway/`)

**Files:**
- `src/server.js`: Fastify server setup, middleware registration
- `src/routes/notification.routes.js`: Route definitions
- `src/handlers/notification.handler.js`: Main notification processing logic
- `src/utils/publisher.js`: RabbitMQ message publishing
- `middlewares/auth.middleware.js`: JWT authentication
- `config/config.js`: Service URLs and configuration

**Key Responsibilities:**
- Request validation and authentication
- Orchestrating calls to User Service and Template Service
- Publishing messages to RabbitMQ
- Tracking notification status in Redis

### User Service (`user_service/`)

**Files:**
- `app/api/v1/endpoints/users.py`: REST API endpoints
- `app/services/user_service.py`: Business logic
- `app/models/user.py`: Database models
- `app/db/database.py`: Database connection

**Key Responsibilities:**
- User data management (CRUD operations)
- User preference management
- Password verification
- Database persistence (PostgreSQL)

### Email Service (`email_service/`)

**Files:**
- `src/email/email.controller.ts`: RabbitMQ message consumer
- `src/email/email.service.ts`: Email processing logic
- `src/sendgrid/sendgrid.service.ts`: SendGrid integration
- `src/main.ts`: NestJS microservice setup

**Key Responsibilities:**
- Consuming messages from RabbitMQ
- Validating user preferences
- Template variable substitution
- Sending emails via SendGrid

---

## Communication Patterns

### Synchronous (REST)
- **Frontend → API Gateway**: HTTP POST/GET
- **API Gateway → User Service**: HTTP GET (fetch user data)
- **API Gateway → Template Service**: HTTP GET (fetch template)

### Asynchronous (Message Queue)
- **API Gateway → Email Service**: RabbitMQ message queue
- **Email Service → SendGrid**: HTTP POST (external API)

---

## Status Tracking

**Redis Storage:**
- **Key Format**: `notification:{correlation_id}`
- **Status Values**: `PENDING`, `QUEUED`, `SENT`, `FAILED`
- **TTL**: 3600 seconds (1 hour)

**Status Updates:**
1. `PENDING`: Request received by API Gateway
2. `QUEUED`: Message published to RabbitMQ
3. `SENT`: Email successfully sent (updated by Email Service)
4. `FAILED`: Error occurred at any stage

**Status Retrieval:**
```javascript
GET /notifications/{notification_id}/status
```

---

## Error Handling

### API Gateway
- User Service unavailable → Returns 500, status: `FAILED`
- Template Service unavailable → Returns 500, status: `FAILED`
- RabbitMQ unavailable → Returns 500, status: `FAILED`
- Invalid notification_type → Returns 400, status: `FAILED`

### Email Service
- User preferences disabled → Skips sending, returns success
- Missing user email → Throws error, message nacked
- Template substitution error → Throws error, message nacked
- SendGrid API error → Throws error, message nacked

---

## Configuration

### API Gateway Environment Variables
```env
PORT=8080
USER_SERVICE_URL=http://user_service:8081
TEMPLATE_SERVICE_URL=http://template_service:8084
RABBITMQ_URL=amqp://user:password@rabbitmq:5672
JWT_SECRET=supersecretjwtkey
REDIS_URL=redis://redis:6379
```

### User Service Environment Variables
```env
DATABASE_URL=postgresql://user:password@postgres:5432/notification_db
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
JWT_SECRET=supersecretjwtkey
```

### Email Service Environment Variables
```env
RABBITMQ_URL=amqp://user:password@rabbitmq:5672
SENDGRID_API_KEY=your_sendgrid_key
SENDGRID_FROM_EMAIL=noreply@example.com
PORT=3002
```

---

## Example Complete Flow

1. **User clicks "Send Notification" in frontend**
2. **Frontend sends POST to API Gateway** with user_id, template_id, variables
3. **API Gateway authenticates** using JWT token
4. **API Gateway fetches user** from User Service (gets email address)
5. **API Gateway fetches template** from Template Service (gets email content)
6. **API Gateway publishes message** to RabbitMQ `email_queue`
7. **API Gateway returns 202 Accepted** with notification_id
8. **Email Service consumes message** from RabbitMQ
9. **Email Service validates** user preferences and data
10. **Email Service substitutes** variables in template
11. **Email Service sends email** via SendGrid
12. **SendGrid delivers email** to user's inbox
13. **User receives email** in their inbox

---

## Summary

The system uses a **hybrid communication pattern**:
- **Synchronous REST** for immediate data fetching (user data, templates)
- **Asynchronous Message Queue** for decoupled email processing
- **Status tracking** via Redis for request monitoring
- **Correlation IDs** for distributed tracing across services

This architecture provides:
- ✅ **Scalability**: Email processing is decoupled and can scale independently
- ✅ **Reliability**: Message queue ensures delivery even if services are temporarily unavailable
- ✅ **Traceability**: Correlation IDs and Redis status tracking
- ✅ **Flexibility**: Easy to add new notification types or services

