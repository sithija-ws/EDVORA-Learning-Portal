// app/(student)/layout.tsx
// Layout for all student-only routes.
// Mobile-first shell with bottom navigation bar.

import { StudentNav } from "@/components/layout/StudentNav";
import { CreditsFooter } from "@/components/layout/CreditsFooter";

interface StudentLayoutProps {
  children: React.ReactNode;
}

export default function StudentLayout({ children }: StudentLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-background">
      <div>
        <StudentNav />
        <main className="mx-auto max-w-3xl pb-24 sm:pb-12">
          {children}
        </main>
      </div>
      <CreditsFooter variant="full" className="hidden sm:block" />
    </div>
  );
}
