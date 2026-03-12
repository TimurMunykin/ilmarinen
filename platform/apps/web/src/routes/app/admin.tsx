// platform/apps/web/src/routes/app/admin.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AiAccessRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/app/admin')({
  component: AdminPage,
});

function AdminPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<AiAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = () => {
    api.getPendingRequests().then(setRequests).finally(() => setLoading(false));
  };

  useEffect(loadRequests, []);

  const handleApprove = async (id: string) => {
    try {
      await api.approveRequest(id);
      loadRequests();
    } catch { alert(t('common.error')); }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectRequest(id);
      loadRequests();
    } catch { alert(t('common.error')); }
  };

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t('admin.title')}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.requests')}</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground">{t('admin.noRequests')}</p>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between border-b pb-3">
                  <div>
                    <p className="font-medium">{req.user.email}</p>
                    <p className="text-sm text-muted-foreground">{req.user.name}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleApprove(req.id)}>
                      {t('admin.approve')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleReject(req.id)}>
                      {t('admin.reject')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
