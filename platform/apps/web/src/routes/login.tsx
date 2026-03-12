// platform/apps/web/src/routes/login.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isAuthenticated } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated()) {
      navigate({ to: '/app' });
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Ilmarinen</h1>
        <p className="text-muted-foreground">{t('auth.tagline')}</p>
        <a href={api.getLoginUrl()}>
          <Button size="lg">{t('auth.loginWith')}</Button>
        </a>
      </div>
    </div>
  );
}
