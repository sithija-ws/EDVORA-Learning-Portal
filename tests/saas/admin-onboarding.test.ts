// tests/saas/admin-onboarding.test.ts
// Test Suite: Phase 4A Admin-Approved Teacher Onboarding, Multi-Portal Routing & Governance
//
// ⚠️ TEST ENVIRONMENT CLASSIFICATION:
// CLASSIFICATION: UNIT / CONTRACT / INTEGRATION TESTS
// Tests migration contracts, validation schemas, authorization gates,
// trial calculations, anti-abuse protections, and middleware redirection contracts.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  LOGIN_PATH,
  REGISTER_PATH,
  STUDENT_LOGIN_PATH,
  TEACHER_LOGIN_PATH,
  TEACHER_REGISTER_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_DASHBOARD_PATH,
  PUBLIC_ROUTES,
} from "../../lib/constants.ts";
import {
  adminLoginSchema,
  approveApplicationSchema,
  rejectApplicationSchema,
  toggleWorkspaceSchema,
  verifyPaymentSlipSchema,
} from "../../lib/validators/admin.ts";
import { registerTeacherSchema } from "../../lib/validators/auth.ts";
import { canonicalizeEmail, getCanonicalEmailHash } from "../../lib/auth/canonical.ts";

describe("Phase 4A: Migration 00020 SQL Integrity & Safety Contracts", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/00020_admin_approved_teacher_onboarding.sql"
  );

  it("Migration 00020 file must exist on disk", () => {
    assert.ok(fs.existsSync(migrationPath), "00020 migration file must exist");
  });

  const sql = fs.readFileSync(migrationPath, "utf-8");

  it("Updates tenants_plan_check constraint to include modern commercial tiers", () => {
    assert.ok(sql.includes("ALTER TABLE public.tenants"), "Must alter tenants table");
    assert.ok(
      sql.includes("'starter'") && sql.includes("'growth'") && sql.includes("'pro'"),
      "Must include starter, growth, and pro plans in constraint"
    );
  });

  it("Creates public.teacher_applications table with required columns and index", () => {
    assert.ok(
      sql.includes("CREATE TABLE IF NOT EXISTS public.teacher_applications"),
      "Must create teacher_applications table"
    );
    assert.ok(sql.includes("canonical_email_hash"), "Must store canonical email hash");
    assert.ok(
      sql.toLowerCase().includes("status               text        not null default 'pending'"),
      "Must default to pending status"
    );
    assert.ok(
      sql.includes("uq_teacher_applications_canonical_hash"),
      "Must enforce unique canonical hash constraint"
    );
  });

  it("Defines admin_approve_teacher_application with SECURITY DEFINER and hardened search_path", () => {
    assert.ok(
      sql.includes("CREATE OR REPLACE FUNCTION public.admin_approve_teacher_application"),
      "Must define admin_approve_teacher_application RPC"
    );
    assert.ok(
      sql.includes("SECURITY DEFINER"),
      "Stored procedure must be SECURITY DEFINER"
    );
    assert.ok(
      sql.includes("SET search_path = ''"),
      "Stored procedure must enforce empty search_path"
    );
  });

  it("Enforces advisory locking against concurrent double-approvals", () => {
    assert.ok(
      sql.includes("pg_advisory_xact_lock"),
      "Must acquire advisory transaction lock during approval"
    );
  });

  it("Calculates exact 72-hour trial window from clock_timestamp()", () => {
    assert.ok(
      sql.includes("v_now := clock_timestamp()") && sql.includes("INTERVAL '72 hours'"),
      "Trial end must be exactly 72 hours from approval execution"
    );
  });

  it("STRICT SAFETY: Does NOT modify auth.users.email_confirmed_at", () => {
    assert.ok(
      !sql.includes("UPDATE auth.users SET email_confirmed_at"),
      "Must NEVER force email confirmation via SQL"
    );
    assert.ok(
      !sql.includes("auth.users.email_confirmed_at ="),
      "Must not assign email_confirmed_at"
    );
  });

  it("Defines admin_reject_teacher_application with audit logging", () => {
    assert.ok(
      sql.includes("CREATE OR REPLACE FUNCTION public.admin_reject_teacher_application"),
      "Must define admin_reject_teacher_application RPC"
    );
    assert.ok(
      sql.includes("status = 'rejected'"),
      "Must update application status to rejected"
    );
  });

  it("Backfills existing staging unconfirmed teachers into teacher_applications idempotently", () => {
    assert.ok(
      sql.includes("auth.users u") &&
      sql.includes("WHERE p.role = 'teacher'") &&
      sql.includes("tm.id IS NULL") &&
      sql.includes("ON CONFLICT (canonical_email_hash) DO NOTHING"),
      "Must include idempotent backfill for unprovisioned teachers"
    );
  });

  it("Strictly controls EXECUTE privileges (revokes from public, grants to service_role and authenticated)", () => {
    assert.ok(
      sql.includes("REVOKE EXECUTE ON FUNCTION public.admin_approve_teacher_application") &&
      sql.includes("FROM PUBLIC, anon"),
      "Must revoke approval RPC from public and anon"
    );
    assert.ok(
      sql.includes("GRANT EXECUTE ON FUNCTION public.admin_approve_teacher_application") &&
      sql.includes("TO authenticated, service_role"),
      "Must grant approval RPC to authenticated and service_role"
    );
  });
});

describe("Phase 4A: Application Logic & Auto-Provisioning Elimination", () => {
  const authActionsPath = path.resolve(process.cwd(), "actions/auth.ts");
  const authCode = fs.readFileSync(authActionsPath, "utf-8");

  it("actions/auth.ts login() does NOT auto-provision workspaces on initial login", () => {
    // Verify lines 285-328 auto-provisioning was removed
    assert.ok(
      !authCode.includes("auto-provision workspace for confirmed teacher upon initial login"),
      "Legacy auto-provisioning comment must be eliminated"
    );
    assert.ok(
      !authCode.includes("provision_tenant_workspace"),
      "actions/auth.ts must not call provision_tenant_workspace on login"
    );
  });

  it("actions/auth.ts checks teacher_applications status when no membership exists", () => {
    assert.ok(
      authCode.includes("from(\"teacher_applications\")"),
      "Must check teacher_applications table during teacher login"
    );
    assert.ok(
      authCode.includes("Your teacher application is currently under review"),
      "Must return pending review message when status is pending"
    );
    assert.ok(
      authCode.includes("Your teacher application was not approved"),
      "Must return rejected message when status is rejected"
    );
  });

  it("actions/auth.ts registerTeacher creates pending application without provisioning workspace", () => {
    assert.ok(
      authCode.includes("from(\"teacher_applications\").upsert"),
      "registerTeacher must insert application into teacher_applications"
    );
    assert.ok(
      authCode.includes("status: \"pending\""),
      "registerTeacher must set application status to pending"
    );
  });

  it("actions/auth.ts defines adminLogin, studentLogin, and teacherLogin actions", () => {
    assert.ok(authCode.includes("export async function adminLogin"), "adminLogin must be exported");
    assert.ok(authCode.includes("export async function studentLogin"), "studentLogin must be exported");
    assert.ok(authCode.includes("export async function teacherLogin"), "teacherLogin must be exported");
  });
});

describe("Phase 4A: Zod Validation Schemas", () => {
  it("Validates teacher registration schema with optional phone number", () => {
    const valid = registerTeacherSchema.safeParse({
      fullName: "Amila Perera",
      email: "amila@example.com",
      password: "Password123!",
      phoneNumber: "+94771234567",
      workspaceName: "Amila Physics Academy",
      workspaceSlug: "amila-physics",
    });
    assert.ok(valid.success, "Valid teacher registration should succeed");

    const validWithoutPhone = registerTeacherSchema.safeParse({
      fullName: "Amila Perera",
      email: "amila@example.com",
      password: "Password123!",
      workspaceName: "Amila Physics Academy",
    });
    assert.ok(validWithoutPhone.success, "Registration without phone should succeed");
  });

  it("Validates admin login schema", () => {
    const valid = adminLoginSchema.safeParse({
      email: "admin@edvora.lk",
      password: "MasterPassword123!",
    });
    assert.ok(valid.success, "Valid admin login input should succeed");

    const invalidEmail = adminLoginSchema.safeParse({
      email: "not-an-email",
      password: "MasterPassword123!",
    });
    assert.ok(!invalidEmail.success, "Invalid email should fail validation");
  });

  it("Validates application approval schema", () => {
    const valid = approveApplicationSchema.safeParse({
      applicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      verificationMode: "phone_call",
      verifiedPhone: "+94771234567",
      reviewNotes: "NIC and phone confirmed via direct call",
    });
    assert.ok(valid.success, "Valid approval parameters should succeed");

    const invalidMode = approveApplicationSchema.safeParse({
      applicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      verificationMode: "invalid_mode",
      verifiedPhone: "+94771234567",
    });
    assert.ok(!invalidMode.success, "Unrecognized verification mode should fail");
  });

  it("Validates application rejection schema", () => {
    const valid = rejectApplicationSchema.safeParse({
      applicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reviewNotes: "Applicant unreachable after 3 attempts",
    });
    assert.ok(valid.success, "Valid rejection parameters should succeed");

    const missingNotes = rejectApplicationSchema.safeParse({
      applicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reviewNotes: "",
    });
    assert.ok(!missingNotes.success, "Rejection must require review notes");
  });

  it("Validates workspace toggle schema", () => {
    const valid = toggleWorkspaceSchema.safeParse({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      isActive: false,
    });
    assert.ok(valid.success, "Valid workspace toggle should succeed");
  });

  it("Validates payment slip verification schema", () => {
    const valid = verifyPaymentSlipSchema.safeParse({
      paymentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      approve: true,
      extensionDays: 30,
    });
    assert.ok(valid.success, "Valid payment verification should succeed");
  });
});

describe("Phase 4A: Anti-Abuse Email Canonicalization Contracts", () => {
  it("Canonicalizes Google email aliases and subaddressing", () => {
    const base = "teacher@gmail.com";
    const dotAlias = "t.e.a.c.h.e.r@gmail.com";
    const plusAlias = "teacher+free-trial@gmail.com";

    assert.equal(canonicalizeEmail(dotAlias), base);
    assert.equal(canonicalizeEmail(plusAlias), base);
    assert.equal(getCanonicalEmailHash(dotAlias), getCanonicalEmailHash(base));
    assert.equal(getCanonicalEmailHash(plusAlias), getCanonicalEmailHash(base));
  });

  it("Different canonical emails produce distinct hashes", () => {
    const emailA = "teacher.alpha@gmail.com";
    const emailB = "teacher.beta@gmail.com";
    assert.notEqual(getCanonicalEmailHash(emailA), getCanonicalEmailHash(emailB));
  });
});

describe("Phase 4A: Portal Route & Middleware Redirection Contracts", () => {
  it("Defines all portal path constants correctly", () => {
    assert.equal(STUDENT_LOGIN_PATH, "/student/login");
    assert.equal(TEACHER_LOGIN_PATH, "/teacher/login");
    assert.equal(TEACHER_REGISTER_PATH, "/teacher/register");
    assert.equal(ADMIN_LOGIN_PATH, "/admin/login");
    assert.equal(ADMIN_DASHBOARD_PATH, "/admin/dashboard");
    assert.equal(LOGIN_PATH, "/login");
    assert.equal(REGISTER_PATH, "/register");
  });

  it("Public routes whitelist includes all portal authentication entries", () => {
    const publicList = PUBLIC_ROUTES as readonly string[];
    assert.ok(publicList.includes(LOGIN_PATH), "/login must be public");
    assert.ok(publicList.includes(REGISTER_PATH), "/register must be public");
    assert.ok(publicList.includes(STUDENT_LOGIN_PATH), "/student/login must be public");
    assert.ok(publicList.includes(TEACHER_LOGIN_PATH), "/teacher/login must be public");
    assert.ok(publicList.includes(TEACHER_REGISTER_PATH), "/teacher/register must be public");
    assert.ok(publicList.includes(ADMIN_LOGIN_PATH), "/admin/login must be public");
  });

  it("Protected routes are NOT in PUBLIC_ROUTES", () => {
    const publicList = PUBLIC_ROUTES as readonly string[];
    assert.ok(!publicList.includes("/dashboard"), "/dashboard must be protected");
    assert.ok(!publicList.includes("/home"), "/home must be protected");
    assert.ok(!publicList.includes(ADMIN_DASHBOARD_PATH), "/admin/dashboard must be protected");
  });

  it("Middleware source contains 308 canonical redirects", () => {
    const middlewarePath = path.resolve(process.cwd(), "middleware.ts");
    const middlewareSource = fs.readFileSync(middlewarePath, "utf-8");

    assert.ok(
      middlewareSource.includes("pathname === \"/teacher/dashboard\"") &&
      middlewareSource.includes("NextResponse.redirect(url, 308)"),
      "Must redirect /teacher/dashboard to /dashboard with HTTP 308"
    );

    assert.ok(
      middlewareSource.includes("pathname === \"/student/home\"") &&
      middlewareSource.includes("NextResponse.redirect(url, 308)"),
      "Must redirect /student/home to /home with HTTP 308"
    );

    assert.ok(
      middlewareSource.includes("pathname === REGISTER_PATH") &&
      middlewareSource.includes("url.pathname = TEACHER_REGISTER_PATH"),
      "Must redirect /register to /teacher/register with HTTP 308"
    );
  });
});
