// app/(auth)/register/_components/RegisterForm.tsx
// Modern registration form for tuition teachers activating a 72-hour introductory trial.
// Fully supports Two-Stage Email Ownership Verification (SEC-3B2C-CRIT-01).

"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { registerTeacher, resendVerificationEmail } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User,
  Mail,
  Lock,
  Building2,
  Sparkles,
  ArrowRight,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import type { ActionResult } from "@/types";

export function RegisterForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");

  // Verification state (SEC-3B2C-CRIT-01)
  const [isPendingVerification, setIsPendingVerification] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const handleWorkspaceNameChange = (val: string) => {
    setWorkspaceName(val);
    const suggested = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setWorkspaceSlug(suggested);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResendStatus(null);

    const formData = new FormData();
    formData.append("fullName", fullName);
    formData.append("email", email);
    formData.append("password", password);
    formData.append("workspaceName", workspaceName);
    formData.append("workspaceSlug", workspaceSlug);

    startTransition(async () => {
      try {
        const result: ActionResult<{
          tenantId?: string;
          slug?: string;
          pendingVerification?: boolean;
          email?: string;
        }> = await registerTeacher(null, formData);

        if (!result.success) {
          setError(result.error);
        } else if (result.data?.pendingVerification) {
          setSubmittedEmail(result.data.email || email);
          setIsPendingVerification(true);
        }
      } catch (err: unknown) {
        // redirect() throws NEXT_REDIRECT which is expected on auto-confirmed environments
        if (err && typeof err === "object" && "digest" in err) {
          throw err;
        }
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    });
  };

  const handleResend = async () => {
    if (!submittedEmail) return;
    setIsResending(true);
    setResendStatus(null);

    try {
      const res = await resendVerificationEmail(submittedEmail);
      if (res.success) {
        setResendStatus("A new verification link has been sent to your email.");
      } else {
        setResendStatus(res.error || "Failed to resend verification email.");
      }
    } catch {
      setResendStatus("Failed to resend verification email. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  // Render Verification Confirmation Screen (SEC-3B2C-CRIT-01)
  if (isPendingVerification) {
    return (
      <div className="space-y-5 text-center py-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Mail className="h-7 w-7" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Verify Your Email Address
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
            We sent a verification link to <strong className="text-foreground">{submittedEmail}</strong>.
            Please click the confirmation link in your email to verify account ownership and activate your 72-hour introductory trial.
          </p>
        </div>

        {resendStatus && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary font-medium flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{resendStatus}</span>
          </div>
        )}

        <div className="pt-2 space-y-2.5">
          <Button
            type="button"
            variant="outline"
            disabled={isResending}
            onClick={handleResend}
            className="w-full h-10 rounded-xl text-xs font-semibold"
          >
            {isResending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Resend Verification Link
          </Button>

          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center h-10 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Proceed to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 72-Hour Free Trial Callout */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground/90 space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-primary">
          <Sparkles className="h-4 w-4" />
          <span>72-Hour All-Access Free Trial</span>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Create tuition batches, upload lessons, share notes, and test student logins. No credit card required.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="font-medium leading-relaxed">{error}</span>
        </div>
      )}

      {/* Full Name */}
      <div className="space-y-1.5">
        <Label htmlFor="fullName" className="text-xs font-semibold text-foreground">
          Full Name
        </Label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="fullName"
            type="text"
            required
            placeholder="e.g. Ruwan Perera"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isPending}
            className="pl-10 h-10 rounded-xl bg-background border-border"
          />
        </div>
      </div>

      {/* Email Address */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-semibold text-foreground">
          Email Address
        </Label>
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            required
            placeholder="teacher@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            className="pl-10 h-10 rounded-xl bg-background border-border"
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs font-semibold text-foreground">
          Password (min. 8 characters)
        </Label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            className="pl-10 pr-10 h-10 rounded-xl bg-background border-border"
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Tuition Workspace Name */}
      <div className="space-y-1.5">
        <Label htmlFor="workspaceName" className="text-xs font-semibold text-foreground">
          Tuition Institute / Workspace Name
        </Label>
        <div className="relative">
          <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="workspaceName"
            type="text"
            required
            placeholder="e.g. Apex Physics Academy"
            value={workspaceName}
            onChange={(e) => handleWorkspaceNameChange(e.target.value)}
            disabled={isPending}
            className="pl-10 h-10 rounded-xl bg-background border-border"
          />
        </div>
      </div>

      {/* Workspace Identifier (Slug) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="workspaceSlug" className="text-xs font-semibold text-foreground">
            Workspace Code / URL Handle
          </Label>
          <span className="text-[10px] text-muted-foreground">Used by students to log in</span>
        </div>
        <Input
          id="workspaceSlug"
          type="text"
          placeholder="e.g. apex-physics"
          value={workspaceSlug}
          onChange={(e) => setWorkspaceSlug(e.target.value.toLowerCase().trim())}
          disabled={isPending}
          className="h-10 rounded-xl bg-background border-border font-mono text-xs"
        />
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 flex items-center justify-center gap-2 mt-2"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Submitting registration...</span>
          </>
        ) : (
          <>
            <span>Register & Start Free Trial</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      {/* Sign In Link */}
      <div className="text-center pt-2">
        <p className="text-xs text-muted-foreground">
          Already have a tuition account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </form>
  );
}
