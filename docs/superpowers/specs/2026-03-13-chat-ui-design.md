# Chat UI Design Spec

## Goal

Add a chat interface where users describe their app idea in natural language. The backend drives a conversation via OpenAI, forms a structured AppSpec, and presents it to the user for confirmation. On confirm, the existing Engine pipeline runs.

## UX Flow

1. User clicks "Создать приложение" on dashboard → navigates to `/app/chat/new`
2. Frontend calls `POST /chat/sessions`, gets session ID, navigates (client-side) to `/app/chat/$sessionId`
3. User types a message describing their app idea
4. Backend sends message history + system prompt to OpenAI, returns AI response
5. AI asks clarifying questions (models, fields, screens, notifications)
6. When AI has enough information, it returns a message with `metadata.type = "spec_proposal"` containing the formed `AppSpec`
7. Frontend renders a spec card (app name, models, screens) with "Создать" / "Изменить" buttons
8. "Изменить" — user continues chatting, AI updates the spec
9. "Создать" → frontend calls `POST /apps` (createApp) then `POST /apps/:id/generate` with the spec → pipeline starts
10. Redirect to dashboard where the app appears with status CREATING

## Architecture

### Backend: ChatModule

New NestJS module at `platform/apps/api/src/modules/chat/`.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat/sessions` | Create a new ChatSession for the current user |
| `GET` | `/chat/sessions/:id` | Get session with messages |
| `POST` | `/chat/sessions/:id/messages` | Send user message, get AI response |

All endpoints require JWT auth and enforce ownership (session.userId === user.id).

**`POST /chat/sessions/:id/messages` flow:**

1. Validate user owns the session
2. Save user message to `ChatMessage` (role: "user")
3. Load all session messages from DB
4. Build OpenAI messages array: system prompt + message history
5. Call OpenAI `chat.completions.create` (model: `gpt-4o`, configurable via `OPENAI_MODEL` env) with `response_format: json_object` (system prompt must mention "JSON" for this mode to work)
6. Parse response — AI returns `{ message: string, spec?: AppSpec }`
7. Save AI message to `ChatMessage` (role: "assistant", content: message text, metadata column stores spec if present)
8. Return the AI message with spec (if present) to frontend

**System prompt** instructs AI to:
- Act as a friendly app design assistant speaking the user's language
- Ask clarifying questions about what the app should do
- Identify models (entities), their fields, screens, and notification rules
- When confident, output `spec` field with a valid `AppSpec` JSON object
- Keep the conversation concise (3-5 exchanges typical)
- Explain the spec in human terms in the `message` field when proposing
- Always respond in JSON format with `message` and `spec` fields

**Message limit:** Max 30 messages per session. After the limit, the endpoint returns 400 with a message suggesting the user start a new session.

**Response format from AI (JSON):**
```json
{
  "message": "Human-readable response to show in chat",
  "spec": null | { ...AppSpec }
}
```

When `spec` is non-null, the frontend shows the spec proposal card.

### Database Migration

Add `metadata Json?` column to `ChatMessage` for storing spec proposals. Run as the first implementation step:

```bash
# Add metadata field to ChatMessage in schema.prisma, then:
cd platform/apps/api && bunx prisma migrate dev --name add-chat-message-metadata
```

Updated model:

```prisma
model ChatMessage {
  id        String   @id @default(uuid())
  role      String
  content   String
  metadata  Json?    // stores spec proposal when role=assistant
  sessionId String
  createdAt DateTime @default(now())

  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}
```

### Frontend: Chat Route

**New files:**
- `src/routes/app/chat.new.tsx` — creates session via API, redirects to `/app/chat/$sessionId`
- `src/routes/app/chat.$sessionId.tsx` — main chat page
- `src/components/chat/chat-messages.tsx` — message list component
- `src/components/chat/chat-input.tsx` — input with send button
- `src/components/chat/spec-card.tsx` — spec proposal card with confirm/edit actions

**Chat page layout:**
- Full-height flex column
- Messages area (scrollable, auto-scroll to bottom)
- Input bar pinned at bottom (textarea + send button)
- Each message: avatar (user/AI) + bubble with text
- AI messages with spec: text + spec card below

**Spec card renders:**
- App name and description
- Models list with fields (as a simple table/list)
- Screens list
- Notification rules (if any)
- Two buttons: "Создать приложение" (primary) and "Изменить" (secondary, focuses input)

**On "Создать приложение" click:**
1. Call `api.createApp({ name: spec.name, subdomain: spec.subdomain })`
2. Call `api.generateApp(appId, spec)` (new API method wrapping `POST /apps/:id/generate`)
3. Navigate to `/app` (dashboard)
4. **Error handling:** if `generateApp` fails, show error toast and offer retry. If `createApp` fails (e.g., subdomain taken), show error in the chat and let user modify the spec.

**Chat input:**
- Textarea (auto-resize, max 4 lines)
- Send on Enter (Shift+Enter for newline)
- Disabled while AI is responding (show typing indicator)

**Dashboard update:**
- Wire the "Создать приложение" button to navigate to `/app/chat/new`

### API Client Updates

Add to `platform/apps/web/src/lib/api.ts`:

```typescript
// Types
export interface ChatSession {
  id: string;
  userId: string;
  appId: string | null;
  messages: ChatMessageDTO[];
  createdAt: string;
}

export interface ChatMessageDTO {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: { spec?: AppSpec } | null;
  createdAt: string;
}

export interface AppSpec {
  name: string;
  subdomain: string;
  description: string;
  models: {
    name: string;
    fields: { name: string; type: string; optional?: boolean; target?: string }[];
  }[];
  screens: {
    name: string;
    type: 'list' | 'detail' | 'form';
    model: string;
  }[];
  notifications?: {
    trigger: { model: string; condition: string };
    channel: 'telegram';
    template: string;
  }[];
}

// API methods
createChatSession: () =>
  apiFetch<{ id: string }>('/chat/sessions', { method: 'POST' }),
getChatSession: (id: string) =>
  apiFetch<ChatSession>(`/chat/sessions/${id}`),
sendChatMessage: (sessionId: string, content: string) =>
  apiFetch<ChatMessageDTO>(`/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  }),

// Engine
generateApp: (appId: string, spec: AppSpec) =>
  apiFetch(`/apps/${appId}/generate`, {
    method: 'POST',
    body: JSON.stringify({ spec }),
  }),
```

### i18n Keys

Add to both `ru.json` and `en.json`:

**ru.json:**
```json
{
  "chat": {
    "title": "Создание приложения",
    "placeholder": "Опишите, какое приложение вы хотите создать...",
    "send": "Отправить",
    "thinking": "Думаю...",
    "specCard": {
      "title": "Ваше приложение",
      "models": "Модели данных",
      "screens": "Экраны",
      "notifications": "Уведомления",
      "create": "Создать приложение",
      "edit": "Изменить"
    },
    "error": "Произошла ошибка, попробуйте ещё раз",
    "limitReached": "Достигнут лимит сообщений. Создайте новую сессию."
  }
}
```

**en.json:**
```json
{
  "chat": {
    "title": "Create App",
    "placeholder": "Describe the app you want to create...",
    "send": "Send",
    "thinking": "Thinking...",
    "specCard": {
      "title": "Your App",
      "models": "Data Models",
      "screens": "Screens",
      "notifications": "Notifications",
      "create": "Create App",
      "edit": "Edit"
    },
    "error": "An error occurred, please try again",
    "limitReached": "Message limit reached. Please start a new session."
  }
}
```

## Dependencies

- Uses `AiAccessService.resolveApiKey(userId)` for OpenAI API key (same as Engine)
- Uses existing `ChatSession` and `ChatMessage` Prisma models (+ metadata column migration)
- Uses existing `AppsService.createApp()` and Engine `POST /apps/:id/generate` for pipeline trigger
- Uses `openai` npm package (already installed in Plan 3)

## Out of Scope

- SSE/streaming responses (future enhancement)
- Chat history page (listing past sessions)
- Editing existing apps via chat (Plan 3 already has `POST /apps/:id/edit`)
- File/image uploads in chat
- Multiple AI providers (OpenAI only for now)
