// platform/apps/web/src/routes/app/chat.$sessionId.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AppSpec, type ChatMessageDTO } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ChatMessages } from '@/components/chat/chat-messages';
import { ChatInput } from '@/components/chat/chat-input';
import { SpecCard } from '@/components/chat/spec-card';

export const Route = createFileRoute('/app/chat/$sessionId')({
  component: ChatSessionPage,
});

function ChatSessionPage() {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    api
      .getChatSession(sessionId)
      .then((session) => setMessages(session.messages))
      .catch(() => setError(t('chat.error')))
      .finally(() => setIsLoading(false));
  }, [sessionId, t]);

  const handleSend = async (content: string) => {
    const optimisticMessage: ChatMessageDTO = {
      id: `optimistic-${Date.now()}`,
      role: 'user',
      content,
      metadata: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setIsSending(true);
    setError(null);

    try {
      const aiMessage = await api.sendChatMessage(sessionId, content);
      setMessages((prev) => [...prev, aiMessage]);
    } catch {
      setError(t('chat.error'));
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirm = async (spec: AppSpec) => {
    setIsCreating(true);
    setError(null);
    try {
      const app = await api.createApp({ name: spec.name, subdomain: spec.subdomain });
      await api.generateApp(app.id, spec);
      navigate({ to: '/app' });
    } catch {
      setError(t('chat.error'));
      setIsCreating(false);
    }
  };

  const lastSpec = findLastSpec(messages);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/app' })}>
          {t('common.back')}
        </Button>
        <h2 className="text-lg font-semibold">{t('chat.title')}</h2>
      </div>

      <ChatMessages messages={messages} isLoading={isSending}>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {lastSpec && (
          <SpecCard
            spec={lastSpec}
            onConfirm={() => handleConfirm(lastSpec)}
            onEdit={() => {}}
            isCreating={isCreating}
          />
        )}
      </ChatMessages>

      <ChatInput onSend={handleSend} disabled={isLoading || isSending || isCreating} />
    </div>
  );
}

function findLastSpec(messages: ChatMessageDTO[]): AppSpec | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const spec = messages[i].metadata?.spec;
    if (spec) return spec;
  }
}
