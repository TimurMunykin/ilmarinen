// platform/apps/web/src/routes/__root.tsx
import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { setToken } from '@/lib/auth';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle OAuth callback: token is in URL hash
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      const token = hash.slice(7);
      setToken(token);
      window.history.replaceState({}, '', '/');
      navigate({ to: '/app' });
    }
  }, [navigate]);

  return <Outlet />;
}
