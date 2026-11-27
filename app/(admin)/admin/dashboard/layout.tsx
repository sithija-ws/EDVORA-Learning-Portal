// app/(admin)/admin/dashboard/layout.tsx
// Shell layout for Platform Administration Dashboard.

import { AdminNav } from "@/components/layout/AdminNav";
import { CreditsFooter } from "@/components/layout/CreditsFooter";

interface AdminDashboardLayoutProps {
  children: React.ReactNode;
}

export default function AdminDashboardLayout({ children }: AdminDashboardLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-background">
      <div className="flex-1">
        <AdminNav />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
      <CreditsFooter variant="minimal" />
    </div>
  );
}
