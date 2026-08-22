import { AdminSidebar } from './admin-sidebar';

export function AdminShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-xl text-bone">{title}</h1>
          {action}
        </div>
        {children}
      </main>
    </div>
  );
}
