import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, setToken } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    // Handle token from auth callback
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setToken(token);
      window.history.replaceState({}, '', '/');
      navigate({ to: '/app' });
      return;
    }

    if (isAuthenticated()) {
      navigate({ to: '/app' });
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">{{APP_NAME}}</h1>
        <a href={api.getLoginUrl()}>
          <Button>{t('auth.loginWith')}</Button>
        </a>
      </div>
    </div>
  );
}
