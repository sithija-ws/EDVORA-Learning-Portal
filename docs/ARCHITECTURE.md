# System Architecture — Edvora

**Version:** 1.0  
**Status:** Draft — Awaiting Developer Approval  
**Date:** 2026-11-21  
**Stack confirmed:** Next.js App Router · TypeScript (strict) · Tailwind CSS · shadcn/ui · Supabase (Auth + PostgreSQL) · Zod · React Hook Form

---

## 1. Architecture Overview

Edvora is a **server-rendered, full-stack Next.js application** backed by Supabase as the sole backend service. There is no separate API server. All data fetching for authenticated views is performed via Supabase's JavaScript client, with Row Level Security (RLS) enforcing data isolation at the database layer.

```
┌─────────────────────────────────────────────────┐
│                   Browser / Client              │
│  Next.js App Router (React Server Components)   │
│  + Client Components (forms, video player)      │
└─────────────┬───────────────────────────────────┘
              │  HTTPS (Vercel CDN)
┌─────────────▼───────────────────────────────────┐
│              Next.js Server (Vercel Edge)        │
│  · Server Actions (mutations)                   │
│  · Route Handlers (webhooks if needed)          │
│  · Middleware (auth session check)              │
└─────────────┬───────────────────────────────────┘
              │  Supabase JS Client (service role / anon key)
┌─────────────▼───────────────────────────────────┐
│                   Supabase                       │
│  ┌────────────────┐  ┌─────────────────────┐    │
│  │  Auth (GoTrue) │  │  PostgreSQL + RLS    │    │
│  └────────────────┘  └─────────────────────┘    │
└─────────────────────────────────────────────────┘
              │
        YouTube IFrame API (CDN, client-side only)
```

### Key Architecture Principles

| Principle | Implementation |
|-----------|---------------|
| **Zero backend hosting cost** | Vercel Hobby (free) for Next.js; Supabase Free tier for DB + Auth |
| **Security at the data layer** | Supabase RLS policies — not just application-level guards |
| **Minimal JavaScript shipped to client** | React Server Components for all read-only pages; Client Components only where interaction is required |
| **No secrets in the browser** | `SUPABASE_SERVICE_ROLE_KEY` used only in Server Actions / Route Handlers; only `SUPABASE_ANON_KEY` ever reaches the client |
| **Progressive enhancement** | Forms work via Server Actions; JS enhances but doesn't gate basic functionality |

---

## 2. Technology Stack (Confirmed)

| Layer | Technology | Why |
|-------|------------|-----|
| **Framework** | Next.js 14+ App Router | File-based routing, RSC, Server Actions, edge-ready |
| **Language** | TypeScript (strict) | Type safety across client/server boundary |
| **Styling** | Tailwind CSS | Utility-first; small CSS bundle; no runtime style injection |
| **UI Components** | shadcn/ui | Accessible, unstyled-at-core; copies into project (no lock-in) |
| **Database** | Supabase PostgreSQL (free tier) | Managed Postgres; 500 MB storage; 2 GB bandwidth; sufficient for MVP |
| **Authentication** | Supabase Auth (GoTrue) | Handles JWTs, sessions, password hashing; free |
| **DB client** | `@supabase/ssr` + `@supabase/supabase-js` | Server and client Supabase access with cookie-based sessions |
| **Validation** | Zod | Schema validation for forms, API inputs, and type inference |
| **Forms** | React Hook Form + Zod resolver | Performant, accessible forms with server action integration |
| **Deployment** | Vercel Hobby (free) | Zero-config Next.js deployment; HTTPS by default |
| **Version control** | Git + GitHub | Standard; Vercel integrates directly for CI/CD |

### Free Tier Limits (Supabase)

| Resource | Free Limit | Edvora Estimate |
|----------|-----------|-----------------|
| Database storage | 500 MB | <5 MB (text only, no file uploads) ✅ |
| Monthly active users | 50,000 | <500 students ✅ |
| Auth users | 50,000 | <500 ✅ |
| Bandwidth | 2 GB/month | Low (no media served) ✅ |
| Edge Function invocations | 500,000/month | Not used in MVP ✅ |

> [!IMPORTANT]
> Supabase free-tier projects **pause after 7 days of inactivity**. Use the "No pausing" option available on the free plan via the Supabase dashboard, or use a cron-based health ping. This must be addressed before launch.

---

## 3. Authentication Design

### 3.1 How Supabase Auth is Used

Supabase Auth stores users in the `auth.users` table (managed internally). Our `public.profiles` table extends each auth user with application-level data (role, batch, display name, active status).

```
auth.users (Supabase-managed)
  id (UUID) ──────────────────┐
  email                       │  one-to-one
  encrypted_password          │
                              ▼
public.profiles
  id (UUID, FK → auth.users.id)
  full_name       TEXT
  role            TEXT  CHECK IN ('teacher', 'student')
  batch_id        UUID  FK → public.batches.id  (NULL for teacher)
  is_active       BOOLEAN  DEFAULT true
  phone           TEXT  (optional)
  created_at      TIMESTAMPTZ
```

### 3.2 Student Login Credential

- Students log in with **email + password** via Supabase Auth.
- The teacher creates student accounts using the **Supabase Admin API** (service role key, server-side only).
- Student emails will follow the pattern: `student-username@edvora.internal` (a fake domain suffix that is never emailed to — just a unique identifier). The teacher provides a simple username; Edvora builds the email internally.
- Students log in with just their **username** (the platform strips the domain). This is handled via a login form that appends the domain before calling Supabase Auth.

> [!NOTE]
> This avoids requiring students to have real email addresses while still using Supabase Auth's standard email+password flow. No email is ever sent to these addresses.

### 3.3 Teacher Account

- The teacher account is **seeded once** via a Supabase SQL migration or the Supabase dashboard — not through the application UI.
- Teacher email: a real email address (the teacher's own), so they can use Supabase's password reset if needed.
- The teacher's profile has `role = 'teacher'` and `batch_id = NULL`.

### 3.4 Session Management

- Sessions are managed via **HTTP-only cookies** using the `@supabase/ssr` package.
- Next.js middleware reads the cookie on every request and redirects unauthenticated users to `/login`.
- Sessions expire per Supabase's default JWT expiry (1 hour access token, refreshed automatically via refresh token).

### 3.5 Deactivated Accounts

- Deactivating a student sets `is_active = false` in `public.profiles`.
- The middleware checks `is_active` after session validation and redirects to `/disabled` if false.
- The student's Supabase Auth account is NOT deleted — only flagged — preserving data integrity.

---

## 4. Database Schema

### 4.1 Entity Relationship

```
auth.users
    │
    │ 1:1
    ▼
profiles ──── batch_id ────► batches
                                │
                    ┌───────────┴───────────┐
                    │                       │
              announcements           lesson_batches ◄── lessons
              announcement_batches ───────►batches
```

### 4.2 Table Definitions

```sql
-- ─── BATCHES ───────────────────────────────────────────────────────────────
CREATE TABLE public.batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  year        INTEGER NOT NULL,
  description TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── PROFILES (extends auth.users) ─────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  batch_id    UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── LESSONS ────────────────────────────────────────────────────────────────
CREATE TABLE public.lessons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  youtube_id    TEXT NOT NULL,          -- e.g. "dQw4w9WgXcQ" (extracted from URL)
  thumbnail_url TEXT,                   -- https://img.youtube.com/vi/{id}/hqdefault.jpg
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── LESSON ↔ BATCH (many-to-many) ─────────────────────────────────────────
CREATE TABLE public.lesson_batches (
  lesson_id  UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  batch_id   UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, batch_id)
);

-- ─── ANNOUNCEMENTS ──────────────────────────────────────────────────────────
CREATE TABLE public.announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,           -- plain text (markdown in V2)
  is_broadcast BOOLEAN NOT NULL DEFAULT false,  -- true = all batches
  is_pinned    BOOLEAN NOT NULL DEFAULT false,  -- post-MVP; schema ready
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── ANNOUNCEMENT ↔ BATCH (many-to-many, only used if is_broadcast = false) ─
CREATE TABLE public.announcement_batches (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  batch_id        UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, batch_id)
);
```

### 4.3 Indexes

```sql
CREATE INDEX idx_profiles_batch_id    ON public.profiles(batch_id);
CREATE INDEX idx_profiles_role        ON public.profiles(role);
CREATE INDEX idx_lesson_batches_batch ON public.lesson_batches(batch_id);
CREATE INDEX idx_ann_batches_batch    ON public.announcement_batches(batch_id);
CREATE INDEX idx_lessons_sort         ON public.lessons(sort_order);
CREATE INDEX idx_announcements_created ON public.announcements(created_at DESC);
```

---

## 5. Row Level Security (RLS) Policies

> [!CAUTION]
> RLS is the **primary security layer** for batch isolation. It must be enabled on every table and tested before any data is exposed to students. Never bypass RLS by using the service role key in client-side code.

### 5.1 Enable RLS

```sql
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_batches ENABLE ROW LEVEL SECURITY;
```

### 5.2 Helper Functions

```sql
-- Returns the role of the currently authenticated user
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Returns the batch_id of the currently authenticated student
CREATE OR REPLACE FUNCTION public.get_my_batch_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT batch_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Returns true if the current user is the teacher
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT get_my_role() = 'teacher'
$$;
```

### 5.3 Policies

```sql
-- ── profiles ────────────────────────────────────────────────────────────────
-- Teacher: full access to all profiles
CREATE POLICY "teacher_all_profiles" ON public.profiles
  FOR ALL USING (is_teacher()) WITH CHECK (is_teacher());

-- Student: can only read their own profile
CREATE POLICY "student_own_profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id AND NOT is_teacher());

-- ── batches ─────────────────────────────────────────────────────────────────
-- Teacher: full CRUD
CREATE POLICY "teacher_all_batches" ON public.batches
  FOR ALL USING (is_teacher()) WITH CHECK (is_teacher());

-- Student: can only read their own batch (and only if not archived)
CREATE POLICY "student_own_batch" ON public.batches
  FOR SELECT USING (
    id = get_my_batch_id()
    AND is_archived = false
    AND NOT is_teacher()
  );

-- ── lessons ─────────────────────────────────────────────────────────────────
-- Teacher: full CRUD
CREATE POLICY "teacher_all_lessons" ON public.lessons
  FOR ALL USING (is_teacher()) WITH CHECK (is_teacher());

-- Student: can only read lessons assigned to their batch
CREATE POLICY "student_batch_lessons" ON public.lessons
  FOR SELECT USING (
    NOT is_teacher()
    AND EXISTS (
      SELECT 1 FROM public.lesson_batches lb
      WHERE lb.lesson_id = lessons.id
        AND lb.batch_id = get_my_batch_id()
    )
  );

-- ── lesson_batches ───────────────────────────────────────────────────────────
-- Teacher: full CRUD
CREATE POLICY "teacher_all_lesson_batches" ON public.lesson_batches
  FOR ALL USING (is_teacher()) WITH CHECK (is_teacher());

-- Student: read-only, only their batch assignments
CREATE POLICY "student_lesson_batches" ON public.lesson_batches
  FOR SELECT USING (
    NOT is_teacher()
    AND batch_id = get_my_batch_id()
  );

-- ── announcements ────────────────────────────────────────────────────────────
-- Teacher: full CRUD
CREATE POLICY "teacher_all_announcements" ON public.announcements
  FOR ALL USING (is_teacher()) WITH CHECK (is_teacher());

-- Student: broadcast OR targeted to their batch
CREATE POLICY "student_batch_announcements" ON public.announcements
  FOR SELECT USING (
    NOT is_teacher()
    AND (
      is_broadcast = true
      OR EXISTS (
        SELECT 1 FROM public.announcement_batches ab
        WHERE ab.announcement_id = announcements.id
          AND ab.batch_id = get_my_batch_id()
      )
    )
  );

-- ── announcement_batches ─────────────────────────────────────────────────────
-- Teacher: full CRUD
CREATE POLICY "teacher_all_ann_batches" ON public.announcement_batches
  FOR ALL USING (is_teacher()) WITH CHECK (is_teacher());

-- Student: read-only, only their batch
CREATE POLICY "student_ann_batches" ON public.announcement_batches
  FOR SELECT USING (
    NOT is_teacher()
    AND batch_id = get_my_batch_id()
  );
```

---

## 6. Next.js App Router Structure

### 6.1 Route Layout

```
app/
├── (auth)/
│   └── login/
│       └── page.tsx           # Shared login page (teacher + student)
│
├── (teacher)/                 # Teacher-only route group
│   ├── layout.tsx             # Verifies role = 'teacher' in middleware
│   └── dashboard/
│       ├── page.tsx           # Teacher dashboard (all batches overview)
│       ├── batches/
│       │   ├── page.tsx       # Batch list
│       │   ├── new/page.tsx   # Create batch form
│       │   └── [batchId]/
│       │       ├── page.tsx       # Batch detail (students + content)
│       │       ├── students/
│       │       │   ├── new/page.tsx
│       │       │   └── [studentId]/page.tsx
│       │       ├── lessons/
│       │       │   ├── new/page.tsx
│       │       │   └── [lessonId]/edit/page.tsx
│       │       └── announcements/
│       │           ├── new/page.tsx
│       │           └── [announcementId]/edit/page.tsx
│       └── lessons/
│           └── page.tsx       # All lessons (cross-batch view)
│
├── (student)/                 # Student-only route group
│   ├── layout.tsx             # Verifies role = 'student' + is_active
│   └── home/
│       ├── page.tsx           # Student home (batch name + recent announcements)
│       ├── lessons/
│       │   ├── page.tsx       # Browse lessons
│       │   └── [lessonId]/
│       │       └── page.tsx   # Watch lesson (embedded YouTube player)
│       └── announcements/
│           └── page.tsx       # Announcement feed
│
├── disabled/
│   └── page.tsx               # Shown to deactivated students
│
├── layout.tsx                 # Root layout (fonts, global CSS)
└── not-found.tsx              # Custom 404
```

### 6.2 Middleware

```
middleware.ts                  # Runs on every request
  · Reads Supabase session cookie
  · If no session → redirect to /login
  · If session + role = teacher → allow (teacher) routes only
  · If session + role = student + is_active = false → redirect /disabled
  · If session + role = student → allow (student) routes only
  · Public routes: /login, /disabled, /not-found
```

---

## 7. Data Flow Patterns

### 7.1 Server Component Data Fetching (Read)

```typescript
// app/(student)/home/page.tsx  — example RSC
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function StudentHomePage() {
  const supabase = createSupabaseServerClient()
  // RLS automatically scopes this to the student's batch
  const { data: announcements } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  return <AnnouncementFeed announcements={announcements} />
}
```

### 7.2 Server Actions (Write / Mutate)

```typescript
// app/(teacher)/dashboard/batches/new/actions.ts
'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { batchSchema } from '@/lib/validators/batch'

export async function createBatch(formData: FormData) {
  const parsed = batchSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.flatten() }

  const supabase = createSupabaseServerClient()  // uses service role for writes
  const { error } = await supabase.from('batches').insert(parsed.data)
  if (error) return { error: { form: error.message } }
  redirect('/dashboard/batches')
}
```

### 7.3 YouTube Thumbnail Resolution

No YouTube API key is needed for thumbnails. YouTube's public CDN provides thumbnails at a predictable URL:

```
https://img.youtube.com/vi/{VIDEO_ID}/hqdefault.jpg
```

Extract the video ID from the pasted URL using a regex on the server:

```typescript
export function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )
  return match ? match[1] : null
}
```

---

## 8. Deployment Architecture

```
GitHub (main branch)
        │  push → auto-deploy
        ▼
Vercel Hobby (free)
  · Next.js build
  · Edge middleware
  · HTTPS (automatic)
  · Custom domain: when available (edvora.lk or similar)
        │
        ▼
Supabase (free tier)
  · PostgreSQL database
  · Auth (GoTrue)
  · Connection pooling via Supavisor (built in)
```

### Environment Variables

```bash
# .env.local  (never commit to git)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...        # safe for client
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...            # server only — never expose
```

> [!CAUTION]
> `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. It must **never** appear in any Client Component, `'use client'` file, or be prefixed `NEXT_PUBLIC_`.

---

## 9. Security Checklist

| Check | Mechanism |
|-------|-----------|
| Auth on every route | Next.js middleware checks session cookie |
| Batch isolation | Supabase RLS policies on every table |
| Role enforcement | Middleware + RLS helper `is_teacher()` |
| Deactivated account block | Middleware checks `is_active` after session auth |
| No XSS from user content | React escapes output by default; no `dangerouslySetInnerHTML` |
| CSRF protection | Server Actions use Next.js built-in CSRF tokens |
| SQL injection | Supabase JS client uses parameterized queries |
| Secrets never in client | `SUPABASE_SERVICE_ROLE_KEY` is server-only |
| HTTPS | Enforced by Vercel (automatic TLS) |
| YouTube embed sandboxing | Use `allow="accelerometer; encrypted-media"` iframe attributes |

---

## 10. Decisions Resolved by Confirmed Stack

The following open questions from `OPEN_QUESTIONS.md` are now resolved:

| OQ | Question | Resolution |
|----|----------|------------|
| OQ-01 | Student registration | Teacher-created via Server Action using service role key |
| OQ-02 | Student login credential | Username (teacher-assigned) → mapped to `username@edvora.internal` email |
| OQ-03 | Forgot password | Teacher resets via Supabase dashboard; no self-service in MVP |
| OQ-07 | Push notifications | Not in MVP; Supabase Realtime could power this in V2 |
| OQ-08 | YouTube URL type | Any valid YouTube URL accepted; no enforcement of unlisted |
| OQ-13 | Hosting | Vercel Hobby (free) + Supabase free tier |
| OQ-15 | Tech stack | Confirmed: Next.js + TS + Tailwind + shadcn + Supabase |

---

*Last updated: 2026-11-21*
