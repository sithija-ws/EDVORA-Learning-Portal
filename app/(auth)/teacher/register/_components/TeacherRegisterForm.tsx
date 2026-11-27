// app/(auth)/teacher/register/_components/TeacherRegisterForm.tsx
// Teacher onboarding application form with identity details and workspace preferences.

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
  Phone,
  Lock,
  Building2,
  ArrowRight,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
} from "lucide-react";
import type { ActionResult } from "@/types";

export function TeacherRegisterForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");

  // Verification & application pending state
  const [isSubmitted, setIsSubmitted] = useState(false);
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
    formData.append("phoneNumber", phoneNumber);
    formData.append("password", password);
    formData.append("workspaceName", workspaceName);
    formData.append("workspaceSlug", workspaceSlug);

    startTransition(async () => {
      try {
        const result: ActionResult<{
          pendingVerification?: boolean;
          email?: string;
        }> = await registerTeacher(null, formData);

        if (!result.success) {
          setError(result.error);
        } else {
          setSubmittedEmail(result.data?.email || email);
          setIsSubmitted(true);
        }
      } catch (err: unknown) {
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
        setResendStatus(res.error || "Failed to resend email.");
      }
    } catch {
      setResendStatus("Network error while resending confirmation email.");
    } finally {
      setIsResending(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="space-y-5 text-center animate-in fade-in-50 duration-300">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
          <Clock className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-black tracking-tight text-foreground">
            Application Received!
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your tuition workspace request for <strong className="text-foreground">{workspaceName}</strong> has been submitted to Edvora administration for review.
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 text-left space-y-2 text-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-muted-foreground">
              We have sent an email confirmation link to <span className="font-semibold text-foreground font-mono">{submittedEmail}</span>. Please click the link to confirm your email ownership.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-muted-foreground">
              Our administration team will review your application details. Once approved, you can sign in to activate your introductory 72-hour trial.
            </p>
          </div>
        </div>

        {resendStatus && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary font-medium animate-in fade-in-50">
            {resendStatus}
          </div>
        )}

        <div className="pt-2 flex flex-col gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={isResending}
            className="w-full h-10 rounded-xl text-xs font-semibold"
          >
            {isResending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Resending Link...</span>
              </span>
            ) : (
              <span>Resend Confirmation Email</span>
            )}
          </Button>

          <Link
            href="/teacher/login"
            className="inline-flex items-center justify-center w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:bg-primary/90 transition-all"
          >
            <span>Proceed to Teacher Login</span>
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold text-destructive animate-in fade-in-50 duration-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Full Name */}
      <div className="space-y-1.5">
        <Label htmlFor="fullName" className="text-xs font-bold text-foreground">
          Educator Full Name
        </Label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
            <User className="h-4 w-4" />
          </div>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            required
            disabled={isPending}
            placeholder="e.g. Bandara Weerasinghe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-10 rounded-xl border-border bg-muted/20 pl-10 text-xs transition-all focus:bg-background"
          />
        </div>
      </div>

      {/* Email Address */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-bold text-foreground">
          Email Address
        </Label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
            <Mail className="h-4 w-4" />
          </div>
          <Input
            id="email"
            name="email"
            type="email"
            required
            disabled={isPending}
            placeholder="tutor@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-xl border-border bg-muted/20 pl-10 text-xs transition-all focus:bg-background"
          />
        </div>
      </div>

      {/* Contact Phone Number */}
      <div className="space-y-1.5">
        <Label htmlFor="phoneNumber" className="text-xs font-bold text-foreground">
          Mobile Contact Number
        </Label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
            <Phone className="h-4 w-4" />
          </div>
          <Input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            disabled={isPending}
            placeholder="e.g. 077 123 4567"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="h-10 rounded-xl border-border bg-muted/20 pl-10 text-xs transition-all focus:bg-background"
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs font-bold text-foreground">
          Account Password
        </Label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
            <Lock className="h-4 w-4" />
          </div>
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            disabled={isPending}
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-xl border-border bg-muted/20 pl-10 pr-10 text-xs transition-all focus:bg-background"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Academy / Institute Name */}
      <div className="space-y-1.5">
        <Label htmlFor="workspaceName" className="text-xs font-bold text-foreground">
          Tuition Academy / Class Name
        </Label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <Input
            id="workspaceName"
            name="workspaceName"
            type="text"
            required
            disabled={isPending}
            placeholder="e.g. Apex Physics Institute"
            value={workspaceName}
            onChange={(e) => handleWorkspaceNameChange(e.target.value)}
            className="h-10 rounded-xl border-border bg-muted/20 pl-10 text-xs transition-all focus:bg-background"
          />
        </div>
      </div>

      {/* Workspace Identifier / Slug */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="workspaceSlug" className="text-xs font-bold text-foreground">
            Workspace Identifier
          </Label>
          <span className="text-[10px] text-muted-foreground font-mono">
            edvora.lk/{workspaceSlug || "identifier"}
          </span>
        </div>
        <Input
          id="workspaceSlug"
          name="workspaceSlug"
          type="text"
          disabled={isPending}
          placeholder="apex-physics"
          value={workspaceSlug}
          onChange={(e) => setWorkspaceSlug(e.target.value.toLowerCase().trim())}
          className="h-10 rounded-xl border-border bg-muted/20 text-xs font-mono transition-all focus:bg-background"
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-11 rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98] mt-2"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Submitting Application...</span>
          </span>
        ) : (
          <span className="flex items-center justify-center gap-1.5">
            <span>Submit Teacher Application</span>
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>

      <div className="pt-2 text-center text-xs text-muted-foreground">
        Already have an approved workspace?{" "}
        <Link href="/teacher/login" className="font-bold text-primary hover:underline">
          Sign In
        </Link>
      </div>
    </form>
  );
}
