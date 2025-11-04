# WhatsApp Integration with AI

This integration allows your WhatsApp Business API to automatically respond to messages using AI.

## Setup

### 1. Environment Variables

Add these to your `.env` file:

```env
# WhatsApp Configuration
WHATSAPP_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
WHATSAPP_APP_SECRET=your_app_secret
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_API_VERSION=v21.0

# Optional
WHATSAPP_API_TIMEOUT=30000
WHATSAPP_MAX_RETRIES=3
WHATSAPP_RATE_LIMIT_PER_SECOND=80

# AI Configuration (already configured)
OPENROUTER_API_KEY=your_openrouter_key
AI_MODEL=minimax/minimax-m2:free
```

### 2. Webhook Setup

1. **Set Webhook URL in Meta Developer Console:**
   - Go to Meta for Developers
   - Navigate to your WhatsApp Business App
   - Set webhook URL to: `https://yourdomain.com/api/whatsapp/webhook`
   - Set verify token to match `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

2. **Verify Webhook:**
   - Meta will send a GET request to verify
   - The webhook route handles this automatically

### 3. Features

- ✅ **Automatic AI Responses** - Messages are processed by AI and responded automatically
- ✅ **Conversation History** - Maintains context across messages
- ✅ **Streaming Responses** - Fast, real-time AI responses
- ✅ **Error Handling** - Graceful error handling with user-friendly messages
- ✅ **Message Status Tracking** - Logs message delivery status

## Usage

### Send Message via API

```typescript
POST /api/whatsapp/send
{
  "to": "1234567890",
  "message": "Hello!",
  "previewUrl": false
}
```

### Webhook Endpoints

- **GET** `/api/whatsapp/webhook` - Webhook verification
- **POST** `/api/whatsapp/webhook` - Receive webhook events

## How It Works

1. User sends message to WhatsApp number
2. Meta sends webhook to `/api/whatsapp/webhook`
3. Webhook handler extracts message
4. AI processes message with conversation history
5. AI response is sent back via WhatsApp
6. Original message is marked as read

## Customization

### Change AI Prompt

Edit `app/api/whatsapp/webhook/route.ts` and modify the prompt:

```typescript
const ai = createAIWithPrompt(
  'Your custom prompt here'
);
```

### Modify Conversation History

The conversation history is stored in memory. For production, consider using Redis or a database.

## Testing

Test the webhook locally using ngrok:

```bash
ngrok http 3000
```

Then set the webhook URL in Meta to: `https://your-ngrok-url.ngrok.io/api/whatsapp/webhook`

