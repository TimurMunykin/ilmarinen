import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});

interface TelegramStatus {
  url: string | null;
  connected: boolean;
}

function SettingsPage() {
  const { t } = useTranslation();
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);

  useEffect(() => {
    apiFetch<TelegramStatus>('/settings/telegram').then(setTelegram);
  }, []);

  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-xl font-semibold">{t('settings.title')}</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.telegram')}</CardTitle>
        </CardHeader>
        <CardContent>
          {telegram === null ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : telegram.connected ? (
            <Badge variant="secondary">{t('settings.telegramConnected')}</Badge>
          ) : telegram.url ? (
            <a href={telegram.url} target="_blank" rel="noopener noreferrer">
              <Button size="sm">{t('settings.telegramConnect')}</Button>
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">{t('common.error')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
