# RabbitMQ Dead Letter Queue (DLQ) Setup

## Overview

Dead Letter Queues (DLQ) are used to store messages that cannot be processed after multiple retry attempts. This prevents message loss and allows for manual inspection and reprocessing.

## Configuration

### Option 1: Using RabbitMQ Management UI

1. **Access RabbitMQ Management**: `http://localhost:15672`
   - Username: `user`
   - Password: `password`

2. **Create Dead Letter Exchange**:
   - Name: `notifications.dlx` (Dead Letter Exchange)
   - Type: `direct`
   - Durable: `true`

3. **Create Dead Letter Queue**:
   - Name: `email_queue.dlq`
   - Durable: `true`
   - Bind to: `notifications.dlx`
   - Routing Key: `email.failed`

4. **Configure Main Queue with DLX**:
   - Queue: `email_queue`
   - Arguments:
     - `x-dead-letter-exchange`: `notifications.dlx`
     - `x-dead-letter-routing-key`: `email.failed`
     - `x-message-ttl`: `3600000` (optional: 1 hour TTL)

### Option 2: Using RabbitMQ CLI

```bash
# Create Dead Letter Exchange
docker exec infra-rabbitmq-1 rabbitmqctl declare exchange name=notifications.dlx type=direct durable=true

# Create Dead Letter Queue
docker exec infra-rabbitmq-1 rabbitmqctl declare queue name=email_queue.dlq durable=true

# Bind DLQ to DLX
docker exec infra-rabbitmq-1 rabbitmqctl declare binding source=notifications.dlx destination=email_queue.dlq routing_key=email.failed

# Update email_queue with DLX arguments
docker exec infra-rabbitmq-1 rabbitmqctl declare queue name=email_queue durable=true arguments='{"x-dead-letter-exchange":"notifications.dlx","x-dead-letter-routing-key":"email.failed"}'
```

### Option 3: Programmatic Setup (Recommended)

Update the email service to configure DLQ on startup.

## How It Works

1. **Normal Flow**:
   ```
   Message → email_queue → Email Service → Success → ACK
   ```

2. **Failure with Retries**:
   ```
   Message → email_queue → Email Service → Error → NACK (requeue=true)
   → Retry (up to max retries) → Still fails → NACK (requeue=false)
   → Dead Letter Exchange → email_queue.dlq
   ```

3. **Permanent Errors**:
   ```
   Message → email_queue → Email Service → Permanent Error
   → NACK (requeue=false) → Dead Letter Exchange → email_queue.dlq
   ```

## Message Flow

### Transient Error (Retry):
- Attempt 1: Fails → NACK (requeue=true) → Back to queue
- Attempt 2: Fails → NACK (requeue=true) → Back to queue
- Attempt 3: Fails → NACK (requeue=true) → Back to queue
- Attempt 4: Fails → NACK (requeue=true) → Back to queue
- Attempt 5: Fails → NACK (requeue=true) → Back to queue
- Attempt 6: Fails → NACK (requeue=false) → **DLQ**

### Permanent Error (No Retry):
- Attempt 1: Fails → NACK (requeue=false) → **DLQ immediately**

## Monitoring DLQ

### Check DLQ Message Count:
```bash
docker exec infra-rabbitmq-1 rabbitmqctl list_queues name messages
```

### View DLQ Messages:
1. Go to RabbitMQ Management UI: `http://localhost:15672`
2. Navigate to Queues → `email_queue.dlq`
3. Click "Get messages" to inspect failed messages

### Reprocess DLQ Messages:
1. Move messages from DLQ back to main queue
2. Or create a separate service to process DLQ messages
3. Or manually fix issues and reprocess

## Best Practices

1. **Monitor DLQ Size**: Set up alerts if DLQ grows too large
2. **Regular Inspection**: Review DLQ messages to identify patterns
3. **Fix Root Causes**: Address issues causing permanent failures
4. **Retry Strategy**: Implement exponential backoff for transient errors
5. **Message TTL**: Set TTL on main queue to prevent stale messages

## Current Implementation

The email service now:
- ✅ Classifies errors (transient vs permanent)
- ✅ Tracks retry count in message headers
- ✅ Rejects messages after max retries (goes to DLQ if configured)
- ✅ Immediately rejects permanent errors (goes to DLQ if configured)

**Next Step**: Configure RabbitMQ with DLX and DLQ as shown above.

