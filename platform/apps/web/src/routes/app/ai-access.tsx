// platform/apps/web/src/routes/app/ai-access.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AiAccessStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/app/ai-access')({
  component: AiAccessPage,
});

function AiAccessPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AiAccessStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStatus = () => {
    api.getAiStatus().then(setStatus).finally(() => setLoading(false));
  };

  useEffect(loadStatus, []);

  const handleSetKey = async () => {
    if (!apiKey.trim()) return;
    try {
      await api.setAiKey(apiKey.trim());
      setApiKey('');
      loadStatus();
    } catch { alert(t('common.error')); }
  };

  const handleRemoveKey = async () => {
    try {
      await api.removeAiKey();
      loadStatus();
    } catch { alert(t('common.error')); }
  };

  const handleRequestAccess = async () => {
    try {
      await api.requestAiAccess();
      loadStatus();
    } catch { alert(t('common.error')); }
  };

  if (loading || !status) return <div>{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t('aiAccess.title')}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t('aiAccess.ownKey')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {status.hasOwnKey ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('aiAccess.hasKey')}</span>
              <Button variant="outline" size="sm" onClick={handleRemoveKey}>
                {t('aiAccess.removeKey')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={t('aiAccess.enterKey')}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button onClick={handleSetKey}>{t('common.save')}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!status.hasOwnKey && (
        <Card>
          <CardHeader>
            <CardTitle>{t('aiAccess.requestFree')}</CardTitle>
          </CardHeader>
          <CardContent>
            {status.requestStatus === null && (
              <Button onClick={handleRequestAccess}>{t('aiAccess.requestFree')}</Button>
            )}
            {status.requestStatus === 'PENDING' && (
              <p className="text-sm text-muted-foreground">{t('aiAccess.requestPending')}</p>
            )}
            {status.requestStatus === 'APPROVED' && (
              <p className="text-sm text-green-600">{t('aiAccess.requestApproved')}</p>
            )}
            {status.requestStatus === 'REJECTED' && (
              <p className="text-sm text-destructive">{t('aiAccess.requestRejected')}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
