// app/(teacher)/layout.tsx
// Layout for all teacher-only routes.

import { TeacherNav } from "@/components/layout/TeacherNav";
import { CreditsFooter } from "@/components/layout/CreditsFooter";

interface TeacherLayoutProps {
  children: React.ReactNode;
}

export default function TeacherLayout({ children }: TeacherLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-background">
      <div className="flex-1">
        <TeacherNav />
        <main className="mx-auto max-w-7xl pb-12">
          {children}
        </main>
      </div>
      <CreditsFooter variant="full" />
    </div>
  );
}
