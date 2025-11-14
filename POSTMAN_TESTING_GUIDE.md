# Postman Testing Guide - Notification System

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

**Important:** Save the `access_token` and `user.id` from the response for the next steps!

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

**Important:** Save the `access_token` from the response!

---

## Step 3: Get User Data

**Method:** `GET`  
**URL:** `http://localhost:8081/api/v1/users/{user_id}`  

**Replace `{user_id}` with the actual UUID from Step 1**

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

**Important:** Confirm the `user_id` UUID for use in Step 5!

---

## Step 4: Get Template ID

**You need to either CREATE a template or SEARCH for an existing one.**

### Option A: Create a New Template (Recommended if you don't have one)

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

**✅ Save the `id` field** - This is your template ID!

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

**✅ Save the `id` field** - This is your template ID!

**Important:** Use the `id` (UUID) from the response as `template_id` in Step 5!

**See `HOW_TO_GET_TEMPLATE_ID.md` for more details.**

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
  "template_id": "123e4567-e89b-12d3-a456-426614174000",
  "variables": {
    "name": "John Doe",
    "link": "https://example.com/welcome"
  }
}
```

**Note:** The API Gateway only requires these 4 fields:
- `notification_type` (required): `"email"` or `"push"`
- `user_id` (required): UUID string
- `template_id` (required): UUID string  
- `variables` (required): Object with template variables

The `request_id`, `priority`, and `metadata` fields mentioned in the spec are **not currently used** by the API Gateway implementation, but you can include them if needed for your own tracking.

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

**Important Notes:**
- The API Gateway uses `template_id` (UUID), not `template_code`
- The `user_id` must be a valid UUID from Step 1
- The `variables` object will be used to replace `{{name}}` and `{{link}}` in the template
- The `request_id` should be unique for idempotency
- `priority` is optional (defaults to 0)
- `metadata` is optional

---

## Field Mapping Reference

### Notification Request Body Fields:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `notification_type` | string | ✅ Yes | Either `"email"` or `"push"` | `"email"` |
| `user_id` | UUID string | ✅ Yes | User UUID from Step 1 | `"550e8400-e29b-41d4-a716-446655440000"` |
| `template_id` | UUID string | ✅ Yes | Template UUID from Step 4 | `"123e4567-e89b-12d3-a456-426614174000"` |
| `variables` | object | ✅ Yes | Variables for template substitution | `{"name": "John", "link": "https://..."}` |

**Note:** The `request_id`, `priority`, and `metadata` fields from the original spec are **not currently implemented** in the API Gateway. Only the 4 fields above are required.

### Variables Object (UserData):
The `variables` object should contain:
- `name`: string - User's name
- `link`: string (URL) - Link to include in notification
- `meta`: object (optional) - Additional metadata

---

## Complete Example Flow

### 1. Create User
```bash
POST http://localhost:8081/api/v1/users/
Body: {
  "name": "John Doe",
  "email": "msebube@gmail.com",
  "password": "testpassword123",
  "push_token": null,
  "preferences": {"email": true, "push": true}
}
Response: Save user.id = "550e8400-e29b-41d4-a716-446655440000"
```

### 2. Login
```bash
POST http://localhost:8081/api/v1/users/login
Body: {
  "email": "msebube@gmail.com",
  "password": "testpassword123"
}
Response: Save access_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 3. Get User
```bash
GET http://localhost:8081/api/v1/users/550e8400-e29b-41d4-a716-446655440000
Response: Verify user data
```

### 4. Get Template
```bash
GET http://localhost:8084/api/v1/templates/search?name=welcome_email&type=email&language=en
Response: Save template.id = "123e4567-e89b-12d3-a456-426614174000"
```

### 5. Send Notification
```bash
POST http://localhost:8080/api/v1/notifications/send
Headers: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Body: {
  "notification_type": "email",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "template_id": "123e4567-e89b-12d3-a456-426614174000",
  "variables": {
    "name": "John Doe",
    "link": "https://example.com/welcome"
  }
}
Response: 202 Accepted - Notification queued
```

---

## Troubleshooting

### Issue: 401 Unauthorized
- **Solution:** Make sure you're using the `access_token` from Step 1 or Step 2 in the `Authorization` header
- Format: `Authorization: Bearer {token}`

### Issue: 404 Not Found (User)
- **Solution:** Verify the `user_id` is correct and the user exists

### Issue: 404 Not Found (Template)
- **Solution:** Create a template first or use the correct `template_id`

### Issue: 405 Method Not Allowed
- **Solution:** Make sure the URL has a trailing slash: `/api/v1/users/` not `/api/v1/users`

### Issue: 400 Bad Request
- **Solution:** Check that all required fields are present and properly formatted
- Verify UUIDs are valid format
- Ensure `notification_type` is exactly `"email"` or `"push"`

---

## Verification

After Step 5, you should:
1. ✅ Receive a 202 Accepted response
2. ✅ Check email at `msebube@gmail.com` (if SendGrid API key is configured)
3. ✅ Or check email service logs to see the email content (if SendGrid API key is not set)

To check notification status:
```bash
GET http://localhost:8080/api/v1/notifications/{notification_id}/status
```

Replace `{notification_id}` with the `notification_id` from Step 5 response.

