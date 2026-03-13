// platform/apps/web/src/components/chat/chat-messages.tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessageDTO } from '@/lib/api';

interface ChatMessagesProps {
  messages: ChatMessageDTO[];
  isLoading: boolean;
  children?: ReactNode;
}

export function ChatMessages({ messages, isLoading, children }: ChatMessagesProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto flex-1 p-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            }`}
          >
            {message.content}
          </div>
        </div>
      ))}

      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-muted text-muted-foreground rounded-2xl px-4 py-2 text-sm">
            {t('chat.thinking')}
          </div>
        </div>
      )}

      {children}

      <div ref={bottomRef} />
    </div>
  );
}
