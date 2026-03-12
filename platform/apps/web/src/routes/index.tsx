// platform/apps/web/src/routes/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { isAuthenticated } from '@/lib/auth';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (isAuthenticated()) {
      throw redirect({ to: '/app' });
    } else {
      throw redirect({ to: '/login' });
    }
  },
});
