// app/(auth)/teacher/login/_components/TeacherLoginForm.tsx
// Dedicated teacher login form for tuition educators.

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { teacherLogin } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

export function TeacherLoginForm() {
  const [state, formAction, isPending] = useActionState(teacherLogin, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold text-destructive animate-in fade-in-50 duration-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Teacher Email Address */}
      <div className="space-y-1.5">
        <Label htmlFor="username" className="text-xs font-bold text-foreground">
          Email Address
        </Label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
            <Mail className="h-4 w-4" />
          </div>
          <Input
            id="username"
            name="username"
            type="email"
            autoComplete="email"
            required
            disabled={isPending}
            placeholder="teacher@example.com"
            className="h-11 rounded-xl border-border bg-muted/20 pl-10 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Password with Show/Hide Toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-xs font-bold text-foreground">
            Password
          </Label>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
            <Lock className="h-4 w-4" />
          </div>
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={isPending}
            placeholder="••••••••••••"
            className="h-11 rounded-xl border-border bg-muted/20 pl-10 pr-11 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-11 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] mt-2"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Signing in...</span>
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <span>Access Instructor Console</span>
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>

      <div className="pt-2 flex flex-col gap-2 text-center text-xs text-muted-foreground">
        <div>
          New tuition teacher?{" "}
          <Link
            href="/teacher/register"
            className="font-bold text-primary hover:underline"
          >
            Apply for tuition workspace
          </Link>
        </div>
        <div>
          Are you a student?{" "}
          <Link
            href="/student/login"
            className="font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in to Student Portal
          </Link>
        </div>
      </div>
    </form>
  );
}
