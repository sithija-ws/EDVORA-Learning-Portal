# Edvora — Phase 3D.2: Staging End-to-End Security & Multi-Tenant Isolation Verification Report

**Environment Target:** Staging (`edvora-staging` / `voyypkysddyrjuqimzya`)  
**Protected Development Project:** `sauphnaxchcouqslflsl` (Untouched, Detached)  
**Verification Date:** 2026-11-26  
**Database Engine:** PostgreSQL 17.12 (AWS `ap-northeast-1`)  
**Application Server:** Next.js 16.4.6 (Turbopack) running on `http://localhost:3000` with explicit staging configuration from `.env.staging`  
**Current Phase Status:** **STAGE 2 REGISTRATION COMPLETE — AWAITING MANUAL EMAIL CONFIRMATION**

---

## 1. Confirmed Target Environment

- **Target Supabase URL:** `https://voyypkysddyrjuqimzya.supabase.co`
- **Project Ref:** `voyypkysddyrjuqimzya`
- **Protected Development Project Ref:** `sauphnaxchcouqslflsl` (Strictly detached; `.env.local` remains untouched and unused)
- **Environment Load Precedence:** `process.env` explicitly pre-loaded from `.env.staging`; Next.js `@next/env` preserved staging URL and keys with zero development fallback.
- **Initial Staging `auth.users` Count:** 0 records prior to Phase 3D.2.3.

---

## 2. Test Identities & Canonicalization Verification

Per Stage 2 instructions, two authorized test email addresses controlled by the project owner were designated:

- **Teacher A:** `sithijax2@gmail.com`
- **Teacher B:** `sithija.ws@gmail.com`

### Canonicalization Algorithm Verification (SEC-3B2C-HIGH-01)
Tested using `canonicalizeEmail` and `getCanonicalEmailHash` from `lib/auth/canonical.ts`:

| Property | Teacher A | Teacher B | Verdict |
| :--- | :--- | :--- | :--- |
| **Input Email** | `sithijax2@gmail.com` | `sithija.ws@gmail.com` | Verified |
| **Canonical Email** | `sithijax2@gmail.com` | `sithijaws@gmail.com` | Gmail dot-removal applied to B |
| **SHA-256 Digest** | `2eca32271c385bb0c91588c011b3380f11119d9a0eb75324b9ab283842a15582` | `2c10f3169a1ae5b50589ccf7a6a6f39aeafc88b0d3de36bdc10177fe1846be26` | Hashes distinct |
| **Separate Identities?** | `true` | `true` | **PASS** |

The application's canonicalization and trial anti-abuse hashing logic correctly recognizes Teacher A and Teacher B as distinct identities.

---

## 3. Prerequisite Route & Export Fixes (Phases 3D.2.1 & 3D.2.2)

Prior to initiating registration, two framework-level defects were resolved with explicit authorization:
1. **Public Route Whitelist (Phase 3D.2.1):** Added `REGISTER_PATH = "/register"` to `PUBLIC_ROUTES` in `lib/constants.ts` and `isPublicRoute` in `middleware.ts`. Enabled unauthenticated visitors to load `/register` with HTTP 200 instead of HTTP 307 redirect.
2. **Server Action Module Exports (Phase 3D.2.2):** Relocated `ACCOUNT_RATE_LIMIT_OPTIONS` and `IP_RATE_LIMIT_OPTIONS` from `"use server"` module `actions/auth.ts` to `lib/auth/rate-limit.ts`. Eliminated Next.js runtime error `A "use server" file can only export async functions, found object`.

---

## 4. Stage 2 Registration Execution (Phase 3D.2.3)

Both teacher registrations were initiated through the actual application flow (`POST http://localhost:3000/register` dispatching Server Action `registerTeacher` with React Flight encoding):

### 4.1 Test Case STAGE2-REG-01: Teacher A Registration
- **Input Email:** `sithijax2@gmail.com`
- **Full Name:** Teacher Alpha
- **Workspace Name:** Academy Alpha
- **Workspace Slug:** `academy-alpha`
- **Application Response Status:** `200 OK`
- **Sanitized Response Payload:**
  ```json
  {
    "success": true,
    "data": {
      "pendingVerification": true,
      "email": "sithijax2@gmail.com"
    },
    "error": null
  }
  ```
- **Generated Auth User ID:** `645a496d-5bc7-4052-98bd-ef93e50e0da2`
- **Verdict:** **PASS**

### 4.2 Test Case STAGE2-REG-02: Teacher B Registration
- **Input Email:** `sithija.ws@gmail.com`
- **Full Name:** Teacher Beta
- **Workspace Name:** Academy Beta
- **Workspace Slug:** `academy-beta`
- **Application Response Status:** `200 OK`
- **Sanitized Response Payload:**
  ```json
  {
    "success": true,
    "data": {
      "pendingVerification": true,
      "email": "sithija.ws@gmail.com"
    },
    "error": null
  }
  ```
- **Generated Auth User ID:** `d3624259-29e8-4b3f-ad29-d8ec51962796`
- **Verdict:** **PASS**

---

## 5. Actual Staging Database Verification (Read-Only Audit)

A read-only catalog query was executed against staging project `voyypkysddyrjuqimzya` immediately following registration:

### 5.1 `auth.users` State
```sql
SELECT id, email, confirmed_at, email_confirmed_at, confirmation_sent_at, created_at,
       raw_user_meta_data->>'full_name' AS full_name,
       raw_user_meta_data->>'pending_workspace_slug' AS slug
FROM auth.users ORDER BY created_at;
```

**Observed Catalog Records:**
| User ID | Email | Created At | Confirmation Sent At | `confirmed_at` | `email_confirmed_at` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `645a496d-5bc7-4052-98bd-ef93e50e0da2` | `sithijax2@gmail.com` | `2026-11-26 07:44:56Z` | `2026-11-26 07:44:56Z` | **NULL** | **NULL** |
| `d3624259-29e8-4b3f-ad29-d8ec51962796` | `sithija.ws@gmail.com` | `2026-11-26 07:45:02Z` | `2026-11-26 07:45:02Z` | **NULL** | **NULL** |

- Both users were successfully created via Supabase Auth.
- Supabase accepted and dispatched confirmation emails (`confirmation_sent_at` timestamp recorded).
- Both accounts remain strictly unconfirmed (`confirmed_at` and `email_confirmed_at` are **NULL**).

### 5.2 Verification of Zero Premature Workspaces or Subscriptions
```sql
SELECT 'tenants' AS tbl, count(*)::int AS count FROM public.tenants
UNION ALL SELECT 'tenant_members', count(*)::int FROM public.tenant_members
UNION ALL SELECT 'tenant_subscriptions', count(*)::int FROM public.tenant_subscriptions
UNION ALL SELECT 'teacher_trial_claims', count(*)::int FROM public.teacher_trial_claims
UNION ALL SELECT 'profiles', count(*)::int FROM public.profiles;
```

**Observed Table Counts:**
| Table | Row Count | Expected | Evaluation |
| :--- | :---: | :---: | :--- |
| `public.tenants` | **0** | 0 | **PASS** — No workspace provisioned prior to email verification |
| `public.tenant_members` | **0** | 0 | **PASS** — No memberships created prematurely |
| `public.tenant_subscriptions` | **0** | 0 | **PASS** — No trial subscriptions initialized prematurely |
| `public.teacher_trial_claims` | **0** | 0 | **PASS** — No trial claims registered prematurely |
| `public.profiles` | **2** | 2 | **PASS** — Base teacher profiles initialized (`is_active = true`, `role = teacher`) |

### 5.3 Development Project Protection
- `sauphnaxchcouqslflsl` remains untouched and uncontacted. `.env.local` was never read or modified.

---

## 6. Stop Condition & Next Actions

Stage 2 registration is complete.

In accordance with strict safety rules:
- **Zero email addresses have been confirmed.**
- **Zero logins have been attempted.**
- **Zero workspaces have been provisioned.**
- Execution is **STOPPED**.

### Action Required by Project Owner:
You may now manually confirm both accounts through the Supabase Dashboard:
1. Open your Supabase Dashboard for project `edvora-staging` (`voyypkysddyrjuqimzya`).
2. Navigate to **Authentication -> Users**.
3. Locate `sithijax2@gmail.com` and `sithija.ws@gmail.com`.
4. Click **Confirm User** / confirm email for both accounts (or click the confirmation links delivered to your inbox).
5. Once confirmed, reply to authorize proceeding with **Stage 3: Registration and Trial Tests (First Login & Atomic Provisioning)**.
