# Telegram Bot Webhook Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a webhook endpoint to the platform's TelegramModule that handles `/start <token>` from Telegram, validates the token, saves the connection, and confirms to the user.

**Architecture:** New webhook POST endpoint in existing TelegramController, new methods in TelegramService (`handleWebhookUpdate`, `sendMessage`), plus a one-time webhook registration script.

**Tech Stack:** NestJS 11, Telegram Bot API, Prisma

**Spec:** `docs/superpowers/specs/2026-03-13-telegram-bot-design.md`

---

## Chunk 1: Webhook Handler

### Task 1: TelegramService — sendMessage + handleWebhookUpdate

**Files:**
- Modify: `platform/apps/api/src/modules/telegram/telegram.service.ts`
- Modify: `platform/apps/api/src/modules/telegram/telegram.service.test.ts`

**`sendMessage(chatId, text)`:** Sends a message via `https://api.telegram.org/bot<token>/sendMessage`. Gets bot token from `ConfigService` (`TELEGRAM_BOT_TOKEN`). Logs errors but doesn't throw (fire-and-forget).

**`handleWebhookUpdate(update)`:** Receives a Telegram Update object (type inline: `{ message?: { chat: { id: number }; text?: string } }`).
1. Extract `message.text` and `message.chat.id`. If no message or text doesn't start with `/start `, return silently.
2. Extract token from text (everything after `/start `).
3. Call existing `resolveConnectToken(token)` — if fails, send error message to chat, return.
4. Look up app by subdomain via `PrismaService` (`findFirst where subdomain`). If not found, send error, return.
5. Call existing `saveConnection(userId, appId, chatId.toString())`.
6. Send success message to chat.

**Messages:** Success: `"Telegram подключен! Теперь вы будете получать уведомления."` Error: `"Ссылка недействительна или устарела. Попробуйте подключить Telegram заново из настроек приложения."`

**Tests (mock PrismaService, ConfigService, global fetch):**
- `handleWebhookUpdate` — valid token, app found → saves connection, sends success message
- `handleWebhookUpdate` — invalid/expired token → sends error message, no connection saved
- `handleWebhookUpdate` — no message or no `/start` prefix → does nothing
- `sendMessage` — calls Telegram API with correct URL and body

- [ ] **Step 1:** Write failing tests
- [ ] **Step 2:** Run tests — expect FAIL
- [ ] **Step 3:** Implement `sendMessage` and `handleWebhookUpdate`
- [ ] **Step 4:** Run tests — expect PASS
- [ ] **Step 5:** Commit: `feat(telegram): add webhook handler and sendMessage`

---

### Task 2: Webhook controller endpoint

**Files:**
- Modify: `platform/apps/api/src/modules/telegram/telegram.controller.ts`

**Add endpoint:** `POST /telegram/webhook` — no auth guard (Telegram sends unauthenticated). Accepts raw body, calls `telegramService.handleWebhookUpdate(body)`, always returns 200 (empty object). Must not throw — wrap in try/catch, log errors.

- [ ] **Step 1:** Add `POST /webhook` endpoint to `TelegramController`
- [ ] **Step 2:** Commit: `feat(telegram): add webhook endpoint`

---

### Task 3: Webhook registration script

**Files:**
- Create: `platform/scripts/register-telegram-webhook.ts`

**Script:** Reads `TELEGRAM_BOT_TOKEN` and `WEBHOOK_URL` from env (or argv). Calls `POST https://api.telegram.org/bot<token>/setWebhook` with `{ url }`. Prints result. Run with `bun run platform/scripts/register-telegram-webhook.ts`.

- [ ] **Step 1:** Create the script
- [ ] **Step 2:** Commit: `feat(telegram): add webhook registration script`

---

## Chunk 2: Validation

### Task 4: Build validation

- [ ] **Step 1:** Run `cd platform/apps/api && bunx prisma generate && bunx tsc --noEmit` — expect no errors
- [ ] **Step 2:** Run `cd platform/apps/api && bunx jest` — expect all tests pass
- [ ] **Step 3:** Fix any issues, commit if needed: `fix(telegram): address build validation issues`
