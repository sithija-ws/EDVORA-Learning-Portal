// app/page.tsx
// Root page — redirects to login.
// Logged-in users will be redirected to their home by middleware in M1.

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/login");
}

