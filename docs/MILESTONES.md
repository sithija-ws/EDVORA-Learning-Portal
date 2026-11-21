# Development Milestones — Edvora

**Version:** 1.0  
**Status:** Draft — Awaiting Developer Approval  
**Date:** 2026-11-21

---

## Overview

Each milestone is a **vertical slice** — shippable, testable, and committed to Git before moving to the next. No milestone starts until the previous one passes its acceptance criteria.

```
M0: Project Setup
      │
M1: Authentication & Role Routing
      │
M2: Batch & Student Management
      │
M3: Lessons
      │
M4: Announcements
      │
M5: Student Portal (Full UX)
      │
M6: Hardening & Launch Readiness
```

---

## Milestone 0 — Project Setup

**Goal:** A running Next.js project with all tools configured and deployable to Vercel.

### Tasks
- [ ] `npx create-next-app@latest edvora --typescript --tailwind --app --src-dir=false --import-alias "@/*"`
- [ ] Enable TypeScript strict mode in `tsconfig.json`
- [ ] Install and configure shadcn/ui (`npx shadcn@latest init`)
- [ ] Add required shadcn components (button, card, form, input, label, select, textarea, toast, badge, dialog, separator, table)
- [ ] Install Supabase packages: `@supabase/ssr @supabase/supabase-js`
- [ ] Install Zod, React Hook Form, `@hookform/resolvers`
- [ ] Create `.env.local` and `.env.example` with Supabase variables
- [ ] Set up Supabase project (free tier) in dashboard
- [ ] Create `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`
- [ ] Create `middleware.ts` stub (passes all requests through for now)
- [ ] Create `supabase/migrations/` directory
- [ ] Write migration `00001_create_tables.sql` (full schema from ARCHITECTURE.md)
- [ ] Write migration `00002_enable_rls.sql`
- [ ] Write migration `00003_rls_policies.sql`
- [ ] Write migration `00004_seed_teacher.sql` (create teacher Supabase Auth user + profile)
- [ ] Apply migrations to Supabase project
- [ ] Push to GitHub; connect repository to Vercel
- [ ] Add environment variables to Vercel dashboard
- [ ] Confirm: Vercel preview URL loads the Next.js default page

### Acceptance Criteria
- [ ] `npm run build` completes with zero TypeScript errors
- [ ] `npm run lint` passes with zero warnings (eslint strict)
- [ ] The app deploys to Vercel with a working preview URL
- [ ] Supabase tables and RLS policies exist and are confirmed in Supabase dashboard
- [ ] The teacher Supabase Auth user exists and can be found in the Auth dashboard
- [ ] `.env.local` is in `.gitignore` and not committed

---

## Milestone 1 — Authentication & Role Routing

**Goal:** Teacher and student can log in. The middleware correctly routes them to their respective areas and blocks unauthorised access.

### Tasks
- [ ] Build `/login` page with username + password form (shadcn Form + React Hook Form + Zod)
- [ ] Implement `actions/auth.ts`: `login(formData)` Server Action
  - Appends `@edvora.internal` domain to student usernames; teacher uses real email
  - Calls `supabase.auth.signInWithPassword()`
  - Reads role from `profiles` table post-login
  - Redirects to `/dashboard` (teacher) or `/home` (student) based on role
- [ ] Implement `actions/auth.ts`: `logout()` Server Action
- [ ] Complete `middleware.ts`:
  - Unauthenticated → redirect to `/login`
  - `role = teacher` on a student route → redirect to `/dashboard`
  - `role = student` + `is_active = false` → redirect to `/disabled`
  - `role = student` on a teacher route → redirect to `/home`
- [ ] Build teacher dashboard stub page (`/dashboard`)
- [ ] Build student home stub page (`/home`)
- [ ] Build `/disabled` page (clear message + contact teacher instruction)
- [ ] Add logout button to teacher and student layouts

### Acceptance Criteria
- [ ] Teacher can log in with real email; lands on `/dashboard`
- [ ] Student can log in with teacher-assigned username; lands on `/home`
- [ ] Navigating to `/dashboard` while logged in as a student redirects to `/home`
- [ ] Navigating to `/home` while logged in as teacher redirects to `/dashboard`
- [ ] Navigating to any protected route while logged out redirects to `/login`
- [ ] A deactivated student (`is_active = false`) is redirected to `/disabled` after login
- [ ] Logging out clears the session cookie and redirects to `/login`
- [ ] Login with wrong credentials shows an error message (generic, no field distinction)
- [ ] TypeScript: zero errors; ESLint: zero warnings

---

## Milestone 2 — Batch & Student Management

**Goal:** Teacher can create batches and manage students within them. No student can see another student's data.

### Tasks
- [ ] Build Zod schemas: `lib/validators/batch.ts`, `lib/validators/student.ts`
- [ ] Build `actions/batches.ts`: `createBatch()`, `updateBatch()`
- [ ] Build `actions/students.ts`: `createStudent()`, `toggleStudentActive()`, `updateStudent()`
- [ ] `createStudent()` must:
  - Use service role key to call `supabase.auth.admin.createUser()` with email `{username}@edvora.internal`
  - Insert a row into `public.profiles` with `role = 'student'`, `batch_id`, `is_active = true`
- [ ] Teacher Dashboard (`/dashboard`): show list of batches as cards (BatchCard component)
- [ ] Batch list page (`/dashboard/batches`): table of all batches
- [ ] Create Batch form (`/dashboard/batches/new`): name, year, description
- [ ] Batch detail page (`/dashboard/batches/[batchId]`): tabs for Students, Lessons (stub), Announcements (stub)
- [ ] Students tab: list students in batch (name, status badge)
- [ ] Add Student form (`/dashboard/batches/[batchId]/students/new`): name, username, password, phone (optional)
- [ ] Student detail page: edit name/phone, deactivate/reactivate toggle
- [ ] Validate: username uniqueness (checked before creating auth user)
- [ ] RLS test: Confirm a student cannot read another student's profile row via Supabase client

### Acceptance Criteria
- [ ] Teacher can create a batch; it appears on the dashboard
- [ ] Teacher can add a student to a batch; student appears in the batch student list
- [ ] Teacher can deactivate a student; that student is blocked at middleware on next login
- [ ] Teacher can reactivate a student; they can log in again
- [ ] Duplicate batch name shows a validation error
- [ ] Duplicate student username shows a validation error
- [ ] A student's profile row cannot be read by another student (RLS test via Supabase client with student JWT)
- [ ] All forms show inline Zod validation errors
- [ ] Zero TypeScript errors; zero ESLint warnings

---

## Milestone 3 — Lessons

**Goal:** Teacher can add YouTube lessons and assign them to batches. Students in the correct batch can browse and watch lessons. Batch isolation is enforced by RLS.

### Tasks
- [ ] Build Zod schema: `lib/validators/lesson.ts` (includes YouTube URL validation)
- [ ] Build `lib/utils/youtube.ts`: `extractYouTubeId()`, `buildThumbnailUrl()`
- [ ] Build `actions/lessons.ts`: `createLesson()`, `updateLesson()`, `deleteLesson()`
- [ ] `createLesson()` must:
  - Validate YouTube URL and extract video ID
  - Build thumbnail URL (`https://img.youtube.com/vi/{id}/hqdefault.jpg`)
  - Insert lesson + link in `lesson_batches` junction table
- [ ] Teacher: Add Lesson form (`/dashboard/batches/[batchId]/lessons/new`):
  - YouTube URL field (with live preview on paste — client component)
  - Title (auto-populated from YouTube URL parsing if possible, editable)
  - Description (optional)
  - Batch assignment checkboxes (all batches listed)
- [ ] Teacher: All Lessons page (`/dashboard/lessons`): cross-batch list with batch tags
- [ ] Teacher: Edit Lesson page (`/dashboard/lessons/[lessonId]/edit`)
- [ ] Teacher: Delete lesson (with confirmation dialog)
- [ ] Student: Lessons browse page (`/home/lessons`): LessonCard grid/list
  - Thumbnail, title, description preview
  - Only shows lessons assigned to student's batch (RLS enforces this)
- [ ] Student: Lesson watch page (`/home/lessons/[lessonId]`):
  - Page title + description
  - Responsive YouTube embed (`YouTubePlayer.tsx` — client component)
  - Graceful fallback if YouTube is unreachable
- [ ] RLS test: Student with batch A cannot access a lesson assigned only to batch B via URL manipulation

### Acceptance Criteria
- [ ] Teacher pastes a valid YouTube URL; thumbnail auto-appears; title can be edited
- [ ] Pasting an invalid URL shows a clear error
- [ ] Lesson appears in the student's lessons page only after being assigned to their batch
- [ ] Student can watch the embedded YouTube video on mobile (320px screen)
- [ ] Navigating to `/home/lessons/{lessonId}` for a lesson not in the student's batch returns a 404 or redirect (RLS returns no rows)
- [ ] Teacher can edit lesson title/URL; change is immediately reflected for students
- [ ] Teacher can delete a lesson; it disappears from all batch lesson lists
- [ ] Zero TypeScript errors; zero ESLint warnings

---

## Milestone 4 — Announcements

**Goal:** Teacher can post announcements targeted to specific or all batches. Students see only their batch's announcements.

### Tasks
- [ ] Build Zod schema: `lib/validators/announcement.ts`
- [ ] Build `actions/announcements.ts`: `createAnnouncement()`, `updateAnnouncement()`, `deleteAnnouncement()`
- [ ] Teacher: Create Announcement form (`/dashboard/batches/[batchId]/announcements/new`):
  - Title field
  - Body (plain text textarea — markdown render in V2)
  - Audience selector: "All Batches" toggle OR checkbox list of batches
  - Preview of how it will appear
- [ ] Teacher: Edit Announcement page
- [ ] Teacher: Delete Announcement (confirmation dialog)
- [ ] Teacher: Announcement list visible in Batch detail page (Announcements tab)
- [ ] Student: Announcements page (`/home/announcements`):
  - AnnouncementFeed component
  - Reverse-chronological order
  - Published date/time shown (formatted for readability)
  - Broadcast and batch-targeted announcements both appear
- [ ] Student: Home page shows the 3 most recent announcements as a preview with "View all" link
- [ ] RLS test: Student cannot see an announcement targeted only to a different batch

### Acceptance Criteria
- [ ] Teacher can post an announcement to "All Batches"; all students see it
- [ ] Teacher can post to only one batch; only that batch's students see it
- [ ] Empty body shows a validation error
- [ ] Teacher edits an announcement; students see the update immediately
- [ ] Teacher deletes an announcement; it disappears from all feeds
- [ ] Student home shows the 3 latest announcements from their batch
- [ ] A student cannot view another batch's targeted announcement (confirmed via Supabase client test)
- [ ] Zero TypeScript errors; zero ESLint warnings

---

## Milestone 5 — Student Portal UX

**Goal:** The student experience is polished, mobile-first, fast, and intuitive. All navigation works within two taps.

### Tasks
- [ ] Build `StudentNav.tsx`: bottom navigation bar (mobile), top nav (desktop)
  - Tabs: Home · Lessons · Announcements
  - Active tab highlighted
  - Touch targets ≥ 44×44px
- [ ] Build `TeacherNav.tsx`: sidebar (desktop) / hamburger menu (mobile)
- [ ] Responsive audit: test all student pages at 320px, 375px, 768px, 1024px
- [ ] Add `loading.tsx` skeletons for lessons browse and announcement feed
- [ ] Add `error.tsx` for each major section (graceful YouTube fallback)
- [ ] Lazy-load lesson thumbnails (`loading="lazy"` on `<img>`)
- [ ] Student home page: show batch name prominently as page header
- [ ] Add "Back" button / breadcrumb on lesson watch page
- [ ] Confirm all colour contrast meets WCAG 2.1 AA
- [ ] Test on Chrome Android (simulated) and Safari iOS
- [ ] Verify: YouTube embed fills screen width on mobile, respects aspect ratio (16:9)

### Acceptance Criteria
- [ ] A student can reach Home, Lessons, and Announcements within 2 taps from any screen
- [ ] All pages render without horizontal scroll on a 320px viewport
- [ ] All tap targets are ≥ 44×44px (checked in browser DevTools)
- [ ] Lesson thumbnails are lazy-loaded (confirmed in Network tab)
- [ ] The YouTube player is responsive (16:9 aspect ratio, 100% width on mobile)
- [ ] Loading skeletons appear on slow connections before data arrives
- [ ] Zero layout shift issues on the student home page (CLS ≈ 0)
- [ ] Zero TypeScript errors; zero ESLint warnings

---

## Milestone 6 — Hardening & Launch Readiness

**Goal:** The application is secure, production-grade, and ready for real student use.

### Tasks
- [ ] Security audit:
  - Confirm all protected routes redirect unauthenticated users
  - Confirm RLS policies block cross-batch data access (manual test with two student JWTs)
  - Confirm `SUPABASE_SERVICE_ROLE_KEY` is never in client bundle (check with `NEXT_PUBLIC_` prefix audit)
  - Confirm no sensitive data appears in browser Network tab responses
- [ ] Add proper HTTP security headers via `next.config.ts`:
  - `X-Frame-Options: SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` (restrict camera, microphone, geolocation)
- [ ] Supabase project: disable "Confirm email" for student accounts (teacher creates them, no email sent)
- [ ] Supabase project: set project to "No pausing" (or document the cron ping workaround)
- [ ] Add `robots.txt` (disallow all — this is a private platform)
- [ ] Add custom 404 and 500 error pages
- [ ] Verify Vercel deployment: production branch deployed, environment variables confirmed
- [ ] Final browser test matrix:
  - Chrome 120+ (Android, desktop)
  - Safari 17+ (iOS, macOS)
  - Firefox 120+ (desktop)
- [ ] Performance audit:
  - Lighthouse score ≥ 85 (Performance, Accessibility, Best Practices)
  - First Contentful Paint ≤ 2.5s on simulated 4G (Lighthouse throttled)
- [ ] Create teacher onboarding guide (a brief README or doc for the teacher to self-manage)

### Acceptance Criteria
- [ ] All security items above pass manual verification
- [ ] Lighthouse Performance score ≥ 85 on student home page (simulated 4G)
- [ ] Lighthouse Accessibility score ≥ 90
- [ ] No console errors on any page in production
- [ ] The teacher can successfully create a batch, add a student, add a lesson, and post an announcement end-to-end without developer assistance
- [ ] A test student can log in, see their batch, read announcements, and watch a lesson end-to-end
- [ ] `npm run build` produces zero TypeScript errors
- [ ] The production Vercel deployment is live and stable

---

## Milestone Summary Table

| Milestone | Deliverable | Prerequisite |
|-----------|-------------|-------------|
| M0 — Project Setup | Scaffolded repo, DB schema, deployed to Vercel | None |
| M1 — Auth & Routing | Working login, role-based routing, session management | M0 |
| M2 — Batches & Students | Full teacher management of batches and students | M1 |
| M3 — Lessons | Add/assign/watch YouTube lessons | M2 |
| M4 — Announcements | Create/target/read announcements | M2 |
| M5 — Student Portal UX | Mobile-first, polished student experience | M3 + M4 |
| M6 — Hardening | Security audit, performance, production launch | M5 |

---

*Last updated: 2026-11-21*
