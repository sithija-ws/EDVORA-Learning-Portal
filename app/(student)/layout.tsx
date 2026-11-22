// app/(student)/layout.tsx
// Layout for all student-only routes.
// Mobile-first shell with bottom navigation bar.

import { StudentNav } from "@/components/layout/StudentNav";

interface StudentLayoutProps {
  children: React.ReactNode;
}

export default function StudentLayout({ children }: StudentLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <StudentNav />
      <main className="mx-auto max-w-3xl pb-24 sm:pb-8">
        {children}
      </main>
    </div>
  );
}
