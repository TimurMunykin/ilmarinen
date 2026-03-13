// platform/apps/web/src/routes/app/chat.new.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

export const Route = createFileRoute('/app/chat/new')({
  component: ChatNewPage,
});

function ChatNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    api.createChatSession().then(({ id }) => {
      navigate({ to: '/app/chat/$sessionId', params: { sessionId: id } });
    });
  }, [navigate]);

  return <div>{t('common.loading')}</div>;
}
