# Open Questions — Edvora

**Version:** 2.0 (Updated for confirmed tech stack)  
**Status:** Partially Resolved — Remaining items require stakeholder input  
**Date:** 2026-11-21

---

## ✅ Resolved Questions (Tech Stack Confirmed)

The following questions from v1.0 are now resolved by the confirmed technology decisions.

| OQ | Question | Resolution |
|----|----------|------------|
| OQ-01 | Student registration method | **Teacher creates accounts** via Server Action using Supabase Admin API (service role key). No self-registration in MVP. |
| OQ-02 | Student login credential | **Username** (assigned by teacher, e.g. `kumari-2027`). Internally mapped to `username@edvora.internal` for Supabase Auth. Student never sees the email format. |
| OQ-03 | Forgot password | **Teacher resets** via Supabase dashboard. No self-service reset in MVP (requires real email infrastructure). |
| OQ-07 | Push/email notifications | **Not in MVP.** Supabase Realtime could power in-app notifications in V2. |
| OQ-08 | YouTube URL types accepted | **Any valid YouTube URL** accepted. No enforcement of unlisted status at the platform level. |
| OQ-13 | Hosting environment | **Vercel Hobby (free)** for Next.js. **Supabase free tier** for PostgreSQL + Auth. Zero cost. |
| OQ-14 | Language support | **English only** for MVP. Localisation deferred. |
| OQ-15 | Technology stack | **Confirmed:** Next.js App Router + TypeScript strict + Tailwind CSS + shadcn/ui + Supabase (Auth + PostgreSQL) + Zod + React Hook Form. |

---

## ⏳ Still Open — Requires Stakeholder Input

### Product & UX

#### OQ-04 — Can a student belong to more than one batch?

**Question:** Is it possible for a student to study across two batches simultaneously?

**Current design assumption:** One batch per student (enforced by `profiles.batch_id` being a single UUID).

**Impact if YES:** Schema change needed (junction table `student_batches` instead of `profiles.batch_id`). Affects middleware, RLS, and all batch-scoped queries.

**Decision needed before Milestone 2.**

---

#### OQ-05 — What information is required for a student profile?

**Question:** Beyond name, batch, and login credential, which fields does the teacher need?

**Current schema includes:** `full_name`, `phone` (optional), `batch_id`, `is_active`

**Commonly requested in tuition contexts:** School name, parent contact, A/L stream confirmation.

**Decision needed:** Confirm whether `phone` is enough, or if other fields are needed. Adding fields later is a migration — easy, but better to confirm now.

**Decide before Milestone 2.**

---

#### OQ-06 — Announcement body: plain text or markdown?

**Question:** Should the teacher be able to format announcements (bold, lists, links)?

**Current MVP assumption:** Plain text only. No markdown rendering.

**Recommended upgrade (low cost):** Store plain text in DB; render with a simple markdown library (`react-markdown`) on the student side. The teacher just types with simple markdown syntax.

**Impact:** Near-zero — just one additional npm package. Can be decided any time before Milestone 4.

---

#### OQ-10 — Sequential vs non-linear lesson access?

**Question:** Should lessons be watched in order, or can students access any lesson freely?

**Current assumption:** Non-linear (students can watch in any order).

**If sequential locking is needed:** A `lesson_progress` table and lock/unlock UI would be required. This is significantly more complex.

**Decision needed before Milestone 3.**

---

### Business & Operational

#### OQ-11 — Will the teacher need to share PDF/file resources?

**Question:** Will the teacher ever need to attach PDFs, notes, or past papers to lessons or announcements?

**Current MVP assumption:** No file uploads. Teacher shares Google Drive links within lesson descriptions or announcement bodies.

**If YES:** Supabase Storage (free tier: 1 GB) can be used. Adds a file upload UI component and storage policies. Medium complexity addition.

**Decide before Milestone 3 (lessons) or Milestone 4 (announcements).**

---

#### OQ-12 — Expected total student count?

**Question:** How many students will use the platform across all batches?

**Why it matters:** Supabase free tier allows 50,000 monthly active users (more than enough), but knowing the actual count helps validate assumptions.

**Estimate needed:** Rough headcount (e.g., 30 per batch × 3 batches = ~90 students).

---

#### OQ-16 — Post-launch maintenance responsibility?

**Question:** Who maintains the platform after launch? Is the developer retained, or is this a hand-off?

**Why it matters:** If the teacher self-manages, a simple admin UI for all operations is critical. If a developer is retained, some operations (like seeding) can remain CLI-only.

**Influences:** How much we invest in teacher-facing admin UX vs. developer tooling.

---

#### OQ-17 — Target launch date?

**Question:** Is there a hard deadline (e.g., tied to a new batch start in January 2027)?

**Why it matters:** Determines whether all 6 milestones can be completed sequentially or if some must be parallelised.

---

#### OQ-18 — Domain and branding?

**Question:** Has a domain been selected? (e.g., `edvora.lk`, `edvora.com`)  
Are there any branding assets — logo, colour palette, fonts?

**Current state:** Vercel deploys to a `.vercel.app` subdomain for free. A custom domain requires purchase (~\$10–15/year for `.lk`; ~\$10/year for `.com`). **This is the only unavoidable cost if a custom domain is desired.**

**If no custom domain:** The `.vercel.app` URL is fully functional for student use.

---

## 🆕 New Questions Arising from Architecture

#### OQ-19 — Supabase project pausing

**Context:** Supabase free-tier projects pause after 7 days of inactivity (no database queries).

**Question:** Is the teacher comfortable with the platform potentially being unavailable on Monday morning after a quiet week (e.g., holidays)?

**Solutions (all free):**
- Option A: Use a free cron ping service (e.g., `cron-job.org`) to hit the Supabase health endpoint every 24 hours.
- Option B: Upgrade to Supabase Pro (\$25/month) — not an option given zero budget.
- Option C: Accept the risk; teacher can "wake" the project manually via Supabase dashboard.

**Recommended:** Option A (automated ping). Confirm before launch.

---

#### OQ-20 — Teacher login: real email address?

**Context:** The confirmed design uses `username@edvora.internal` for students. For the teacher, we need a real email (so Supabase can send a password reset if needed).

**Question:** What is the teacher's email address? (Needed for seeding the teacher account in migration `00004_seed_teacher.sql`.)

**This is required before Milestone 1.**

---

#### OQ-21 — Cross-batch lessons view in MVP?

**Context:** The proposed architecture has two entry points for adding lessons:
1. From within a specific batch (`/dashboard/batches/[batchId]/lessons/new`)
2. From a global lessons screen (`/dashboard/lessons`)

**Question:** Is the cross-batch lessons view needed in MVP, or is managing lessons per-batch sufficient?

**Recommended:** Keep cross-batch view — useful when the same lesson is shared across batches. Confirm before Milestone 3.

---

*Last updated: 2026-11-21*
