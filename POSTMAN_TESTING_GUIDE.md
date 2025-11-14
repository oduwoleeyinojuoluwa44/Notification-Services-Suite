# Postman Testing Guide - Complete Step-by-Step

## Prerequisites
- All services running via Docker Compose
- API Gateway: `http://localhost:8080`
- User Service: `http://localhost:8081`
- Template Service: `http://localhost:8084`

---

## Step 1: Create a User

**Method:** `POST`  
**URL:** `http://localhost:8081/api/v1/users/`  
**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "John Doe",
  "email": "msebube@gmail.com",
  "password": "testpassword123",
  "push_token": null,
  "preferences": {
    "email": true,
    "push": true
  }
}
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "msebube@gmail.com",
      "push_token": null,
      "created_at": "2024-01-01T12:00:00Z",
      "updated_at": null,
      "preferences": {
        "id": "...",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "email": true,
        "push": true,
        "created_at": "2024-01-01T12:00:00Z",
        "updated_at": null
      }
    }
  },
  "message": "User registered successfully."
}
```

**✅ IMPORTANT:** Save the following from the response:
- `access_token` (for authentication)
- `user.id` (UUID) - for use in Step 3 and Step 5

---

## Step 2: Login as the User

**Method:** `POST`  
**URL:** `http://localhost:8081/api/v1/users/login`  
**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "msebube@gmail.com",
  "password": "testpassword123"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "msebube@gmail.com",
      ...
    }
  },
  "message": "User logged in successfully."
}
```

**✅ IMPORTANT:** Save the `access_token` from the response (use this in Step 5).

---

## Step 3: Get User Data

**Method:** `GET`  
**URL:** `http://localhost:8081/api/v1/users/{user_id}`  

**Replace `{user_id}` with the UUID from Step 1**

**Example URL:**
```
http://localhost:8081/api/v1/users/550e8400-e29b-41d4-a716-446655440000
```

**Headers:**
```
Content-Type: application/json
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "email": "msebube@gmail.com",
    "push_token": null,
    "created_at": "2024-01-01T12:00:00Z",
    "updated_at": null,
    "preferences": {
      "id": "...",
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "email": true,
      "push": true,
      "created_at": "2024-01-01T12:00:00Z",
      "updated_at": null
    }
  },
  "message": "User retrieved successfully."
}
```

**✅ IMPORTANT:** Verify the `user_id` UUID is correct for use in Step 5.

---

## Step 4: Get Template Code

You need to either **CREATE** a template or **SEARCH** for an existing one.

### Option A: Create a New Template (Recommended)

**Method:** `POST`  
**URL:** `http://localhost:8084/api/v1/templates/`  
**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "welcome_email",
  "type": "email",
  "language": "en",
  "content": "<html><body><h1>Hello {{name}}!</h1><p>Welcome to our service. Click here: <a href=\"{{link}}\">{{link}}</a></p></body></html>"
}
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "welcome_email",
    "type": "email",
    "language": "en",
    "content": "<html><body><h1>Hello {{name}}!</h1><p>Welcome to our service. Click here: <a href=\"{{link}}\">{{link}}</a></p></body></html>",
    "version": 1,
    "created_at": "2024-01-01T12:00:00Z",
    "updated_at": "2024-01-01T12:00:00Z"
  },
  "message": "Template created successfully"
}
```

**✅ IMPORTANT:** The `name` field (`"welcome_email"`) is your **template_code** - save this for Step 5!

### Option B: Search for an Existing Template

**Method:** `GET`  
**URL:** `http://localhost:8084/api/v1/templates/search?name=welcome_email&type=email&language=en`

**Query Parameters:**
- `name` (required): Template name (e.g., "welcome_email")
- `type` (required): `"email"` or `"push"`
- `language` (optional): Defaults to `"en"`

**Headers:**
```
Content-Type: application/json
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "welcome_email",
    "type": "email",
    "language": "en",
    "content": "<html><body>Hello {{name}}, welcome! Click here: {{link}}</body></html>",
    "version": 1,
    "created_at": "2024-01-01T12:00:00Z",
    "updated_at": null
  },
  "message": "Template retrieved successfully."
}
```

**✅ IMPORTANT:** The `name` field (`"welcome_email"`) is your **template_code** - save this for Step 5!

---

## Step 5: Send Notification via API Gateway

**Method:** `POST`  
**URL:** `http://localhost:8080/api/v1/notifications/send`  
**Headers:**
```
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Replace `{access_token}` with the token from Step 1 or Step 2**

**Body (raw JSON):**
```json
{
  "notification_type": "email",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "template_code": "welcome_email",
  "variables": {
    "name": "John Doe",
    "link": "https://example.com/welcome",
    "meta": {
      "source": "postman_test"
    }
  },
  "request_id": "req-12345-67890",
  "priority": 1,
  "metadata": {
    "source": "postman_test",
    "campaign": "welcome_flow"
  }
}
```

**Field Descriptions:**
- `notification_type`: `"email"` or `"push"` (required)
- `user_id`: UUID string from Step 1 (required)
- `template_code`: Template name from Step 4 (required) - e.g., `"welcome_email"`
- `variables`: Object with `name`, `link`, and optional `meta` (required)
  - `name`: User's name (string)
  - `link`: URL (string, must be valid URL)
  - `meta`: Optional metadata object
- `request_id`: Unique request identifier (optional, for idempotency)
- `priority`: Priority level 0-10 (optional, defaults to 0)
- `metadata`: Additional metadata object (optional)

**Expected Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "notification_id": "550e8400-e29b-41d4-a716-446655440000-1234567890",
    "status": "accepted",
    "routing_key": "email"
  },
  "message": "Notification request accepted and queued for processing."
}
```

**✅ IMPORTANT:** Save the `notification_id` from the response to check status later.

---

## Step 6: Check Notification Status (Optional)

**Method:** `GET`  
**URL:** `http://localhost:8080/api/v1/notifications/{notification_id}/status`

**Replace `{notification_id}` with the ID from Step 5**

**Example URL:**
```
http://localhost:8080/api/v1/notifications/550e8400-e29b-41d4-a716-446655440000-1234567890/status
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "notification_id": "550e8400-e29b-41d4-a716-446655440000-1234567890",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "template_code": "welcome_email",
    "notification_type": "email",
    "status": "QUEUED",
    "timestamp": "2024-01-01T12:00:00Z",
    "details": "Notification message published to RabbitMQ."
  },
  "message": "Notification status retrieved successfully."
}
```

---

## Complete Example Flow

### 1. Create User
```http
POST http://localhost:8081/api/v1/users/
Content-Type: application/json

{
  "name": "John Doe",
  "email": "msebube@gmail.com",
  "password": "testpassword123",
  "push_token": null,
  "preferences": {"email": true, "push": true}
}
```
**Save:** `user.id = "550e8400-e29b-41d4-a716-446655440000"`  
**Save:** `access_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`

### 2. Login
```http
POST http://localhost:8081/api/v1/users/login
Content-Type: application/json

{
  "email": "msebube@gmail.com",
  "password": "testpassword123"
}
```
**Save:** `access_token` (if different from Step 1)

### 3. Get User
```http
GET http://localhost:8081/api/v1/users/550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```
**Verify:** User data is correct

### 4. Create Template
```http
POST http://localhost:8084/api/v1/templates/
Content-Type: application/json

{
  "name": "welcome_email",
  "type": "email",
  "language": "en",
  "content": "<html><body><h1>Hello {{name}}!</h1><p>Click here: <a href=\"{{link}}\">{{link}}</a></p></body></html>"
}
```
**Save:** `template_code = "welcome_email"`

### 5. Send Notification
```http
POST http://localhost:8080/api/v1/notifications/send
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "notification_type": "email",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "template_code": "welcome_email",
  "variables": {
    "name": "John Doe",
    "link": "https://example.com/welcome",
    "meta": {"source": "postman"}
  },
  "request_id": "req-12345-67890",
  "priority": 1,
  "metadata": {"source": "postman_test"}
}
```

---

## Troubleshooting

### Issue: 401 Unauthorized
**Solution:** Make sure you're using the `access_token` from Step 1 or Step 2 in the `Authorization` header:
```
Authorization: Bearer {your_token_here}
```

### Issue: 404 Not Found (User)
**Solution:** Verify the `user_id` is correct and the user exists. Check Step 1 response.

### Issue: 404 Not Found (Template)
**Solution:** Create a template first using Step 4 Option A, or verify the template name exists.

### Issue: 405 Method Not Allowed
**Solution:** 
- Make sure URLs have trailing slashes where needed: `/api/v1/users/` not `/api/v1/users`
- Use the correct endpoint: `/api/v1/notifications/send` (not `/api/v1/notifications/`)

### Issue: 400 Bad Request
**Solution:** 
- Check that all required fields are present: `notification_type`, `user_id`, `template_code`, `variables`
- Verify `variables` object has `name` and `link` fields
- Ensure `notification_type` is exactly `"email"` or `"push"`
- Verify `user_id` is a valid UUID format
- Verify `template_code` is a string (template name, not UUID)

### Issue: Variables Not Substituting
**Solution:** 
- Make sure template content uses double curly braces: `{{name}}` and `{{link}}`
- Verify variable names in `variables` object match template placeholders exactly

---

## Quick Reference

### Required Fields for Notification Request:
```json
{
  "notification_type": "email" | "push",
  "user_id": "uuid-string",
  "template_code": "template-name-string",
  "variables": {
    "name": "string",
    "link": "url-string",
    "meta": {} // optional
  }
}
```

### Optional Fields:
- `request_id`: string (for idempotency)
- `priority`: integer (0-10)
- `metadata`: object (any key-value pairs)

---

## Verification Checklist

After Step 5, verify:
- ✅ Received 202 Accepted response
- ✅ `notification_id` is returned
- ✅ Check email at `msebube@gmail.com` (if SendGrid API key is configured)
- ✅ Or check email service logs to see email content (if SendGrid API key is not set)
- ✅ Use Step 6 to check notification status

---

## Example for Push Notification

To test push notifications, use the same flow but:

**Step 4:** Create a push template:
```json
{
  "name": "welcome_push",
  "type": "push",
  "language": "en",
  "content": "{\"title\": \"Hello {{name}}!\", \"body\": \"Welcome! Click here: {{link}}\"}"
}
```

**Step 5:** Use `"notification_type": "push"` and `"template_code": "welcome_push"`

---

**That's it!** Follow these steps in order and you'll successfully test the entire notification system.

