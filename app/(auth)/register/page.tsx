// app/(auth)/register/page.tsx
// Teacher self-service registration route.
// Redirects to the canonical /teacher/register onboarding route.

import { redirect } from "next/navigation";
import { TEACHER_REGISTER_PATH } from "@/lib/constants";

export const instant = false;

export default function RegisterPage() {
  redirect(TEACHER_REGISTER_PATH);
}
