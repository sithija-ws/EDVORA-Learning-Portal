// app/(teacher)/layout.tsx
// Layout for all teacher-only routes.

import { TeacherNav } from "@/components/layout/TeacherNav";

interface TeacherLayoutProps {
  children: React.ReactNode;
}

export default function TeacherLayout({ children }: TeacherLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <TeacherNav />
      <main className="mx-auto max-w-7xl">
        {children}
      </main>
    </div>
  );
}
