import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/')({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      {/* AI-generated content will be placed here */}
    </div>
  );
}
