import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, logout } from '@/lib/auth';
import { api, type User } from '@/lib/api';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_app')({
  component: AppLayout,
});

function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate({ to: '/' });
      return;
    }
    api.getMe().then(setUser).catch(() => {
      logout();
    });
  }, [navigate]);

  if (!user) return <div className="p-4">{t('common.loading')}</div>;

  return (
    <div className="min-h-screen">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold">{{APP_NAME}}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            {t('auth.logout')}
          </Button>
        </div>
      </header>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
