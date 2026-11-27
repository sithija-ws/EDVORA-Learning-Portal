# Edvora — Phase 3D.2.1: Public Registration Route Correction Report

**Execution Target:** Staging (`edvora-staging` / `voyypkysddyrjuqimzya`)  
**Protected Development Project:** `sauphnaxchcouqslflsl` (Untouched, Detached)  
**Verification Date:** 2026-11-26  
**Status:** **ROUTING FIX VERIFIED — RUNTIME BLOCKER REPORTED (STOPPED FOR APPROVAL)**

---

## 1. Scope & Exact Files Changed

Per the Phase 3D.2.1 authorization, only two files were modified:

### 1.1 `lib/constants.ts`
- Added `export const REGISTER_PATH = "/register" as const;`
- Updated `PUBLIC_ROUTES` to include `REGISTER_PATH`:
  ```typescript
  export const PUBLIC_ROUTES = ["/login", "/disabled", "/register"] as const;
  ```

### 1.2 `middleware.ts`
- Imported `REGISTER_PATH` from `@/lib/constants`.
- Updated `isPublicRoute` to include `REGISTER_PATH`:
  ```typescript
  const isPublicRoute =
    pathname === LOGIN_PATH ||
    pathname === DISABLED_PATH ||
    pathname === REGISTER_PATH;
  ```

### Git Diff Summary
```diff
diff --git a/lib/constants.ts b/lib/constants.ts
index 918b3a6..ac786e7 100644
--- a/lib/constants.ts
+++ b/lib/constants.ts
@@ -35,7 +35,7 @@ export const ROLE_HOME = {
 /**
  * Public routes that do not require authentication.
  */
-export const PUBLIC_ROUTES = ["/login", "/disabled"] as const;
+export const PUBLIC_ROUTES = ["/login", "/disabled", "/register"] as const;
 
 /**
  * The login page path.
@@ -47,6 +47,11 @@ export const LOGIN_PATH = "/login" as const;
  */
 export const DISABLED_PATH = "/disabled" as const;
 
+/**
+ * The teacher registration page path.
+ */
+export const REGISTER_PATH = "/register" as const;
+
diff --git a/middleware.ts b/middleware.ts
index b1af0be..be3be44 100644
--- a/middleware.ts
+++ b/middleware.ts
@@ -15,11 +15,15 @@ import {
   ROLE_HOME,
   LOGIN_PATH,
   DISABLED_PATH,
+  REGISTER_PATH,
 } from "@/lib/constants";
 
 export async function middleware(request: NextRequest): Promise<NextResponse> {
   const { pathname } = request.nextUrl;
-  const isPublicRoute = pathname === LOGIN_PATH || pathname === DISABLED_PATH;
+  const isPublicRoute =
+    pathname === LOGIN_PATH ||
+    pathname === DISABLED_PATH ||
+    pathname === REGISTER_PATH;
```

---

## 2. Compilation, Linting, Test & Build Verification

| Verification Step | Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **PASS** | Exit code 0, zero type errors. |
| **ESLint Check** | `npm run lint` | **PASS** | Exit code 0, zero warnings or errors. |
| **SaaS Security Test Suite** | `npm run test:saas` | **PASS** | 74 / 74 tests passing across all 4 suites (duration: 6.68s). |
| **Next.js Production Build** | `npm run build` | **PASS** | Exit code 0; all 33 routes optimized and compiled (Turbopack). |

---

## 3. Runtime HTTP Route Behavior Verification

The application was started with explicit staging configuration pointing strictly to `https://voyypkysddyrjuqimzya.supabase.co`. The following live HTTP tests were executed:

### 3.1 Unauthenticated `GET /register`
- **Request:** `GET http://localhost:3000/register` (unauthenticated)
- **Status:** **`200 OK`**
- **Location Header:** None (rendered directly)
- **Body Inspection:** Contains `"Create Tuition Workspace"` header, branding elements, and form inputs.
- **Verdict:** **PASS** — The previous HTTP 307 redirect to `/login` is completely resolved.

### 3.2 Unauthenticated `GET /login`
- **Request:** `GET http://localhost:3000/login` (unauthenticated)
- **Status:** **`200 OK`**
- **Location Header:** None (rendered directly)
- **Body Inspection:** Contains login form components.
- **Verdict:** **PASS** — Login page remains accessible.

### 3.3 Protected Route Boundary (`GET /dashboard`)
- **Request:** `GET http://localhost:3000/dashboard` (unauthenticated)
- **Status:** **`307 Temporary Redirect`**
- **Location Header:** `/login`
- **Verdict:** **PASS** — Protected teacher dashboard routes remain strictly defended and redirect unauthenticated requests to `/login`.

---

## 4. Server Action Dispatch & Runtime Blocker Finding

When testing the resolution of the `registerTeacher` Server Action through the actual application pipeline on `/register`, the request successfully reached the Server Action handler without being redirected to `/login`.

However, the Next.js Server Action runtime halted execution with the following framework error:

### Exact Error
```
Error: A "use server" file can only export async functions, found object.
Read more: https://nextjs.org/docs/messages/invalid-use-server-value
```

### Root Cause in `actions/auth.ts`
`actions/auth.ts` begins with the `"use server"` directive at line 7. Under Next.js and React Server Actions specifications, a `"use server"` module is strictly an RPC boundary and **can only export async functions**.

Lines 35 and 45 of `actions/auth.ts` export rate-limiting configuration objects:
```typescript
// actions/auth.ts:35-49
export const ACCOUNT_RATE_LIMIT_OPTIONS = {
  maxAttempts: 5,
  windowSeconds: 60,
  lockoutSeconds: 60,
};

export const IP_RATE_LIMIT_OPTIONS = {
  maxAttempts: 30,
  windowSeconds: 60,
  lockoutSeconds: 60,
};
```
Because Next.js attempts to register every export of a `"use server"` file into its server action manifest, these two exported objects crash the module evaluation whenever any Server Action from `actions/auth.ts` (`login`, `logout`, `registerTeacher`, `resendVerificationEmail`) is invoked at runtime.

### Proposed Narrow Remediation
Move `ACCOUNT_RATE_LIMIT_OPTIONS` and `IP_RATE_LIMIT_OPTIONS` from `actions/auth.ts` to `lib/auth/rate-limit.ts` (which is a standard utility library file without `"use server"` and already defines `RateLimitOptions` and `DEFAULT_MAX_ATTEMPTS`). Update the imports in `actions/auth.ts` and `tests/saas/student-auth-isolation.test.ts`.

---

## 5. Staging Database State Verification

A read-only query was executed against the staging database (`voyypkysddyrjuqimzya`):

```sql
SELECT count(*)::int AS user_count FROM auth.users;
SELECT count(*)::int AS tenant_count FROM public.tenants;
```

**Result:**
- `user_count`: **0**
- `tenant_count`: **0**
- `tenants`, `tenant_members`, `tenant_subscriptions`, `teacher_trial_claims`: **0**

The staging database remains in a pristine, unseeded state with zero test records.

---

## 6. Current Status & Stop Condition

In strict accordance with instructions:
- **No teacher registrations have been submitted.**
- **No test accounts have been created in `auth.users`.**
- Execution is **STOPPED** awaiting your approval to apply the narrowly scoped export fix (`ACCOUNT_RATE_LIMIT_OPTIONS` / `IP_RATE_LIMIT_OPTIONS`) before proceeding with Teacher A and Teacher B registration in Phase 3D.2.
