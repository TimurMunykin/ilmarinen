// platform/apps/web/src/routes/app/index.tsx
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type App } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/app/')({
  component: Dashboard,
});

function Dashboard() {
  const { t } = useTranslation();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getApps().then(setApps).finally(() => setLoading(false));
  }, []);

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('dashboard.title')}</h2>
        <Link to="/app/chat/new">
          <Button>{t('dashboard.createApp')}</Button>
        </Link>
      </div>

      {apps.length === 0 ? (
        <p className="text-muted-foreground">{t('dashboard.noApps')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {apps.map((app) => (
            <Card key={app.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{app.name}</CardTitle>
                <StatusBadge status={app.status} />
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{app.subdomain}.{import.meta.env.VITE_APPS_BASE_DOMAIN}</p>
                {app.status === 'RUNNING' && (
                  <a
                    href={`https://${app.subdomain}.${import.meta.env.VITE_APPS_BASE_DOMAIN}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">{t('dashboard.open')}</Button>
                  </a>
                )}
                {app.status === 'ERROR' && app.errorReason && (
                  <p className="text-sm text-destructive">{app.errorReason}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: App['status'] }) {
  const { t } = useTranslation();
  const variant = status === 'RUNNING' ? 'default' : status === 'ERROR' ? 'destructive' : 'secondary';
  return <Badge variant={variant as any}>{t(`dashboard.status.${status}`)}</Badge>;
}
