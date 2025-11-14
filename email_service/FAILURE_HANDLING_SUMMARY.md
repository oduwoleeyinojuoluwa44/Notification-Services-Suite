# Email Service Failure Handling - Quick Reference

## ✅ What's Been Implemented

### 1. **Error Classification System**
- Automatically classifies errors as **Transient** (retry) or **Permanent** (DLQ)
- Examples:
  - **Permanent**: Invalid API key, invalid email, missing data
  - **Transient**: Rate limits, server errors, network timeouts

### 2. **Circuit Breaker**
- Protects against cascading failures
- Opens when SendGrid has >50% failure rate
- Automatically resets after 30 seconds
- State visible in health check endpoint

### 3. **Smart Retry Logic**
- **Transient errors**: Retry up to 5 times with exponential backoff
- **Permanent errors**: No retry, go directly to DLQ
- **Unknown errors**: Conservative 3 retries

### 4. **Dead Letter Queue**
- Failed messages automatically routed to `email_queue.dlq`
- Configured in RabbitMQ setup
- View failed messages in RabbitMQ Management UI

### 5. **Enhanced Monitoring**
- Health check includes circuit breaker state
- Structured logging with correlation IDs
- Error classification in logs

## Quick Commands

### Check Health (includes circuit breaker status):
```bash
curl http://localhost:8083/api/v1/health
```

### View DLQ Messages:
1. Open: `http://localhost:15672`
2. Login: `user` / `password`
3. Navigate to: Queues → `email_queue.dlq`

### Setup DLQ (if not already configured):
```bash
bash infra/setup-dlq.sh
```

## How It Works

```
Message → Email Service → Circuit Breaker → SendGrid
                                    ↓
                            Error? → Classify
                                    ↓
                    ┌───────────────┴───────────────┐
                    │                              │
              PERMANENT                      TRANSIENT
                    │                              │
                    ↓                              ↓
              DLQ (immediate)            Retry (up to 5x)
                                              ↓
                                    Still fails? → DLQ
```

## Configuration

All failure handling is **automatic** - no configuration needed!

The system will:
- ✅ Retry transient errors automatically
- ✅ Send permanent errors to DLQ immediately
- ✅ Open circuit breaker if SendGrid is down
- ✅ Log all failures with correlation IDs

## Files to Review

- `email_service/src/email/utils/error-classifier.ts` - Error classification logic
- `email_service/src/sendgrid/sendgrid-circuit-breaker.ts` - Circuit breaker implementation
- `email_service/src/email/email.controller.ts` - Retry logic
- `infra/rabbitmq-dlq-setup.md` - DLQ documentation

## Testing

### Test Permanent Error:
1. Set invalid `SENDGRID_API_KEY`
2. Send notification
3. Check: Message goes to DLQ immediately

### Test Transient Error:
1. Send many notifications quickly (trigger rate limit)
2. Check: Retries with backoff, then DLQ if still fails

### Test Circuit Breaker:
1. Stop SendGrid (or use invalid endpoint)
2. Send multiple notifications
3. Check: Circuit opens, requests rejected

## Status

✅ **Production Ready** - All failure handling features implemented and tested!

