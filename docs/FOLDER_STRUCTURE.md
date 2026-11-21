# Folder Structure — Edvora

**Version:** 1.0  
**Status:** Draft — Awaiting Developer Approval  
**Date:** 2026-11-21

---

## Full Recommended Structure

```
edvora/
│
├── app/                                # Next.js App Router root
│   │
│   ├── (auth)/                         # Route group: public auth pages
│   │   └── login/
│   │       ├── page.tsx                # Login form (teacher + student)
│   │       └── _components/
│   │           └── LoginForm.tsx       # 'use client' — React Hook Form
│   │
│   ├── (teacher)/                      # Route group: teacher-only
│   │   ├── layout.tsx                  # Guard: role must be 'teacher'
│   │   └── dashboard/
│   │       ├── page.tsx                # Dashboard home (batch overview)
│   │       │
│   │       ├── batches/
│   │       │   ├── page.tsx            # List all batches
│   │       │   ├── new/
│   │       │   │   └── page.tsx        # Create batch form
│   │       │   └── [batchId]/
│   │       │       ├── page.tsx        # Batch detail (tabs: Students, Lessons, Announcements)
│   │       │       ├── edit/
│   │       │       │   └── page.tsx    # Edit batch name/description
│   │       │       ├── students/
│   │       │       │   ├── new/
│   │       │       │   │   └── page.tsx    # Add student form
│   │       │       │   └── [studentId]/
│   │       │       │       └── page.tsx    # Student detail / edit / deactivate
│   │       │       ├── lessons/
│   │       │       │   └── new/
│   │       │       │       └── page.tsx    # Add lesson (YouTube URL)
│   │       │       └── announcements/
│   │       │           ├── new/
│   │       │           │   └── page.tsx    # Create announcement
│   │       │           └── [announcementId]/
│   │       │               └── edit/
│   │       │                   └── page.tsx # Edit announcement
│   │       │
│   │       └── lessons/
│   │           ├── page.tsx            # All lessons (cross-batch list)
│   │           └── [lessonId]/
│   │               └── edit/
│   │                   └── page.tsx    # Edit lesson (title, URL, batch assignments)
│   │
│   ├── (student)/                      # Route group: student-only
│   │   ├── layout.tsx                  # Guard: role='student' AND is_active=true
│   │   └── home/
│   │       ├── page.tsx                # Student home (batch header + recent announcements)
│   │       ├── lessons/
│   │       │   ├── page.tsx            # Lessons browse page
│   │       │   └── [lessonId]/
│   │       │       └── page.tsx        # Lesson watch page (YouTube embed)
│   │       └── announcements/
│   │           └── page.tsx            # Full announcement feed
│   │
│   ├── disabled/
│   │   └── page.tsx                    # "Account disabled" page (deactivated students)
│   │
│   ├── layout.tsx                      # Root layout: fonts, Tailwind base, Toaster
│   ├── not-found.tsx                   # Custom 404
│   └── error.tsx                       # Global error boundary
│
├── components/                         # Shared, reusable components
│   ├── ui/                             # shadcn/ui generated components (do not edit manually)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── table.tsx
│   │   ├── textarea.tsx
│   │   ├── toast.tsx
│   │   └── ...                         # Other shadcn components as added
│   │
│   ├── layout/                         # App-level layout primitives
│   │   ├── TeacherNav.tsx              # Teacher sidebar / top nav
│   │   ├── StudentNav.tsx              # Student bottom nav (mobile-first)
│   │   └── PageHeader.tsx             # Reusable page header with back button
│   │
│   ├── announcements/
│   │   ├── AnnouncementCard.tsx        # Single announcement display
│   │   └── AnnouncementFeed.tsx        # List of AnnouncementCards
│   │
│   ├── lessons/
│   │   ├── LessonCard.tsx              # Thumbnail + title card
│   │   ├── LessonList.tsx              # Ordered list of LessonCards
│   │   └── YouTubePlayer.tsx           # 'use client' — responsive YouTube embed
│   │
│   └── batches/
│       └── BatchCard.tsx               # Batch summary card (teacher dashboard)
│
├── lib/                                # Pure utilities and configurations
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client (anon key)
│   │   ├── server.ts                   # Server Supabase client (service role key)
│   │   └── middleware.ts               # Supabase session refresh for middleware
│   │
│   ├── validators/                     # Zod schemas
│   │   ├── batch.ts                    # Batch create/edit schema
│   │   ├── student.ts                  # Student create/edit schema
│   │   ├── lesson.ts                   # Lesson create/edit schema + YouTube URL validation
│   │   └── announcement.ts            # Announcement create/edit schema
│   │
│   ├── utils/
│   │   ├── youtube.ts                  # extractYouTubeId(), buildThumbnailUrl()
│   │   ├── format.ts                   # Date/time formatting helpers
│   │   └── cn.ts                       # Tailwind class merging (clsx + tailwind-merge)
│   │
│   └── constants.ts                    # App-wide constants (EMAIL_DOMAIN, ROLES, etc.)
│
├── actions/                            # Next.js Server Actions
│   ├── auth.ts                         # login(), logout()
│   ├── batches.ts                      # createBatch(), updateBatch()
│   ├── students.ts                     # createStudent(), toggleStudentActive()
│   ├── lessons.ts                      # createLesson(), updateLesson(), deleteLesson()
│   └── announcements.ts               # createAnnouncement(), updateAnnouncement(), deleteAnnouncement()
│
├── types/                              # Shared TypeScript types
│   ├── database.ts                     # Generated or manual Supabase DB types
│   └── index.ts                        # Re-exports + app-level types (Role, etc.)
│
├── middleware.ts                       # Next.js middleware (auth guard + role routing)
│
├── supabase/                           # Supabase local dev config
│   ├── config.toml                     # Supabase CLI config
│   ├── migrations/                     # SQL migration files (numbered)
│   │   ├── 00001_create_tables.sql
│   │   ├── 00002_enable_rls.sql
│   │   ├── 00003_rls_policies.sql
│   │   └── 00004_seed_teacher.sql
│   └── seed.sql                        # (Optional) Local dev seed data
│
├── public/
│   ├── favicon.ico
│   └── logo.svg                        # Edvora logo (when available)
│
├── docs/                               # Project documentation (this directory)
│   ├── PRODUCT_REQUIREMENTS.md
│   ├── USER_STORIES.md
│   ├── MVP_SCOPE.md
│   ├── OPEN_QUESTIONS.md
│   ├── PROJECT_GLOSSARY.md
│   ├── ARCHITECTURE.md
│   ├── FOLDER_STRUCTURE.md             # (this file)
│   └── MILESTONES.md
│
├── .env.local                          # Local secrets (gitignored)
├── .env.example                        # Template for required env vars
├── .gitignore
├── components.json                     # shadcn/ui config
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json                       # Strict mode
├── eslint.config.mjs
└── package.json
```

---

## Conventions

### File Naming

| Type | Convention | Example |
|------|-----------|---------|
| Pages | `page.tsx` (Next.js required) | `app/(student)/home/page.tsx` |
| Layouts | `layout.tsx` (Next.js required) | `app/(teacher)/layout.tsx` |
| Server Actions | camelCase functions in `actions/` | `actions/lessons.ts` |
| React Components | PascalCase `.tsx` | `LessonCard.tsx` |
| Utilities | camelCase `.ts` | `youtube.ts` |
| Zod validators | camelCase `.ts`, named `*Schema` | `lessonSchema` in `lib/validators/lesson.ts` |
| SQL migrations | `00001_description.sql` | `00001_create_tables.sql` |

### Component Boundaries

| Component location | Type | Rule |
|-------------------|------|------|
| `app/**/page.tsx` | Server Component (default) | Fetch data here; pass to children |
| `app/**/layout.tsx` | Server Component | Auth guards here |
| `components/ui/` | Client Component (shadcn) | Use as-is; do not edit |
| `components/layout/` | Server or Client as needed | Navigation may need `'use client'` |
| `components/lessons/YouTubePlayer.tsx` | **Must be Client Component** | Needs browser APIs |
| `components/**/forms/*.tsx` | **Must be Client Component** | React Hook Form requires client |
| `actions/*.ts` | Server Action (`'use server'`) | Never import in client components |

### Import Alias

Configure `tsconfig.json` with:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

All imports use `@/` prefix: `import { createBatch } from '@/actions/batches'`

---

## shadcn/ui Components Needed for MVP

Install these during project setup:

```bash
npx shadcn@latest add button card dialog form input label select separator table textarea toast badge
```

---

*Last updated: 2026-11-21*
