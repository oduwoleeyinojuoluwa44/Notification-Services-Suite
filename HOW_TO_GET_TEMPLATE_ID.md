# How to Get a Template ID

You have **two options** to get a template ID:

## Option 1: Create a New Template (Recommended for Testing)

If you don't have any templates yet, create one first. The response will include the template ID.

### Step 1: Create a Template

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

---

## Option 2: Search for an Existing Template

If you already have templates, you can search for them by name, type, and language.

### Step 1: Search for Template

**Method:** `GET`  
**URL:** `http://localhost:8084/api/v1/templates/search?name={template_name}&type={type}&language={language}`

**Example URLs:**

For an email template:
```
http://localhost:8084/api/v1/templates/search?name=welcome_email&type=email&language=en
```

For a push notification template:
```
http://localhost:8084/api/v1/templates/search?name=welcome_push&type=push&language=en
```

**Query Parameters:**
- `name` (required): Template name (e.g., "welcome_email")
- `type` (required): Template type - either `"email"` or `"push"`
- `language` (optional): Language code, defaults to `"en"` if not provided

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
    "updated_at": "2024-01-01T12:00:00Z"
  },
  "message": "Template retrieved successfully"
}
```

**✅ Save the `id` field** - This is your template ID!

**Note:** The search endpoint returns the **latest version** of the template automatically.

---

## Option 3: Get Template by ID (If You Already Know It)

If you already have a template ID, you can retrieve it directly:

**Method:** `GET`  
**URL:** `http://localhost:8084/api/v1/templates/{template_id}`

**Example:**
```
http://localhost:8084/api/v1/templates/123e4567-e89b-12d3-a456-426614174000
```

---

## Quick Start: Create Your First Template

Here's a ready-to-use template for testing:

**Method:** `POST`  
**URL:** `http://localhost:8084/api/v1/templates/`  
**Body:**
```json
{
  "name": "welcome_email",
  "type": "email",
  "language": "en",
  "content": "<html><body><h1>Hello {{name}}!</h1><p>Welcome to our notification service. Click here to get started: <a href=\"{{link}}\">{{link}}</a></p><p>Best regards,<br>The Team</p></body></html>"
}
```

**Response will include:**
- `id`: Use this as `template_id` in your notification request
- `name`: Template name
- `content`: Template content with `{{name}}` and `{{link}}` placeholders

---

## Template Content Variables

When creating a template, use double curly braces for variables:
- `{{name}}` - Will be replaced with the user's name
- `{{link}}` - Will be replaced with the provided link
- Any other variables you define in the `variables` object

**Example Template Content:**
```html
<html>
  <body>
    <h1>Hello {{name}}!</h1>
    <p>Click here: <a href="{{link}}">{{link}}</a></p>
  </body>
</html>
```

When you send a notification with:
```json
{
  "variables": {
    "name": "John Doe",
    "link": "https://example.com/welcome"
  }
}
```

The template will be rendered as:
```html
<html>
  <body>
    <h1>Hello John Doe!</h1>
    <p>Click here: <a href="https://example.com/welcome">https://example.com/welcome</a></p>
  </body>
</html>
```

---

## Summary

1. **Create a template** → Get the `id` from the response
2. **Search for a template** → Get the `id` from the response  
3. **Use the `id`** as `template_id` in your notification request

**Template ID Format:** UUID (e.g., `"123e4567-e89b-12d3-a456-426614174000"`)

