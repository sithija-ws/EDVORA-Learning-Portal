// app/(auth)/login/_components/LoginForm.tsx
// Modern, tactile login form with input icons, password show/hide toggle, and instant feedback.

"use client";

import { useActionState, useState } from "react";
import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, User, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);
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

      {/* Username / Email Field */}
      <div className="space-y-1.5">
        <Label htmlFor="username" className="text-xs font-bold text-foreground">
          Username or Email
        </Label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
            <User className="h-4 w-4" />
          </div>
          <Input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            disabled={isPending}
            placeholder="Username or email"
            className="h-11 rounded-xl border-border bg-muted/20 pl-10 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Password Field with Show/Hide Toggle */}
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs font-bold text-foreground">
          Password
        </Label>
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
            onClick={() => setShowPassword((prev) => !prev)}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Submit CTA */}
      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Signing in...</span>
          </>
        ) : (
          <>
            <span>Sign In</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
