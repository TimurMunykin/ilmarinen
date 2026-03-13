# Telegram Bot Webhook Design Spec

## Goal

Add a webhook endpoint to the platform's existing TelegramModule that handles `/start <token>` commands from Telegram, completing the user ↔ app connection flow.

## Context

The connection infrastructure is already in place:
- Platform generates HMAC-signed connect tokens (`generateConnectToken`)
- Generated apps provide a "Connect Telegram" button linking to `t.me/ilmarinen_bot?start=<token>`
- Platform stores `TelegramConnection(userId, appId, chatId)` and serves chat IDs to apps
- Generated apps send notifications directly via Telegram API using stored chat IDs

**Missing piece:** The bot webhook handler that receives the `/start` message from Telegram, validates the token, saves the connection, and confirms to the user.

## Architecture

### Webhook Endpoint

`POST /api/telegram/webhook` — unauthenticated (Telegram sends raw POST requests).

Receives a Telegram [Update](https://core.telegram.org/bots/api#update) object. Only processes text messages starting with `/start `.

### Flow

1. Telegram sends Update to webhook URL
2. Controller extracts `message.text` and `message.chat.id`
3. If text doesn't match `/start <token>`, ignore (return 200)
4. Service calls existing `resolveConnectToken(token)` → `{ userId, appSubdomain }`
5. Service looks up app by subdomain via Prisma
6. Service calls existing `saveConnection(userId, appId, chatId)`
7. Service sends confirmation message to user via Telegram `sendMessage` API
8. Return 200 (Telegram expects 200 for all webhook responses)

### Error Handling

- Invalid/expired token → send "Ссылка недействительна или устарела" to user, return 200
- App not found → send error message, return 200
- Any other error → log, return 200 (never return non-200 to Telegram, otherwise it retries)

### New Methods in TelegramService

- `handleWebhookUpdate(update: TelegramUpdate)` — orchestrates the flow above
- `sendMessage(chatId: string, text: string)` — sends a message via `https://api.telegram.org/bot<token>/sendMessage`

### Webhook Registration

One-time script `platform/scripts/register-telegram-webhook.ts` that calls the Telegram `setWebhook` API:

```
POST https://api.telegram.org/bot<token>/setWebhook
Body: { url: "https://ilmarinen.muntim.ru/api/telegram/webhook" }
```

Run manually after deploy. Not part of app startup.

## Files

- **Modify:** `platform/apps/api/src/modules/telegram/telegram.service.ts` — add `handleWebhookUpdate`, `sendMessage`
- **Modify:** `platform/apps/api/src/modules/telegram/telegram.controller.ts` — add `POST /webhook`
- **Modify:** `platform/apps/api/src/modules/telegram/telegram.service.test.ts` — add webhook tests
- **Create:** `platform/scripts/register-telegram-webhook.ts`

## Types

```typescript
// Minimal Telegram types (only what we need)
interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}
```

## i18n / Messages

Bot responses are hardcoded strings (not user-facing platform UI):
- Success: `"Telegram подключен! Теперь вы будете получать уведомления."`
- Invalid token: `"Ссылка недействительна или устарела. Попробуйте подключить Telegram заново из настроек приложения."`

## Dependencies

- Existing `resolveConnectToken` in TelegramService
- Existing `saveConnection` in TelegramService
- `TELEGRAM_BOT_TOKEN` env var (already configured)
- `ConfigService` for accessing env vars

## Out of Scope

- Bot commands beyond `/start`
- Secret token verification for webhook
- Automatic webhook registration on startup
- Bot UI/menu customization
