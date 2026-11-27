// app/(admin)/admin/login/_components/AdminLoginForm.tsx
// Secure login form for platform administrators.

"use client";

import { useActionState, useState } from "react";
import { adminLogin } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  Loader2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";

export function AdminLoginForm() {
  const [state, formAction, isPending] = useActionState(adminLogin, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {/* Security Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
        <div className="flex items-center gap-1.5 font-bold">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Restricted Platform Access</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-amber-800/80 dark:text-amber-300/80">
          This gateway is strictly for authorized Edvora system administrators. All access attempts and administrative events are logged and audited.
        </p>
      </div>

      {state?.error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold text-destructive animate-in fade-in-50 duration-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Admin Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-bold text-foreground">
          Administrator Email
        </Label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
            <Mail className="h-4 w-4" />
          </div>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isPending}
            placeholder="admin@edvora.lk"
            suppressHydrationWarning
            className="h-11 rounded-xl border-border bg-muted/20 pl-10 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Password with Show/Hide Toggle */}
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs font-bold text-foreground">
          Master Password
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
            suppressHydrationWarning
            className="h-11 rounded-xl border-border bg-muted/20 pl-10 pr-11 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            tabIndex={-1}
            suppressHydrationWarning
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
        suppressHydrationWarning
        className="w-full h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 mt-2"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Authenticating administrator...</span>
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4" />
            <span>Sign In to Platform Console</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
