# MVP Scope — Edvora

**Version:** 1.0  
**Status:** Draft — Awaiting Stakeholder Approval  
**Date:** 2026-11-21

---

## 1. Purpose

This document defines the smallest, shippable version of Edvora that delivers genuine value to the teacher and students — fast enough to be usable in an ongoing tuition class, stable enough to rely on day-to-day.

The MVP philosophy: **build only what is essential, build it well, ship it.**

---

## 2. MVP Feature List

These features must be complete before the platform is considered ready for real student use.

### ✅ Authentication
- [ ] Single teacher account with secure login (pre-seeded)
- [ ] Student login with username + password
- [ ] Session management with timeout
- [ ] Account deactivation (teacher can disable a student)

### ✅ Batch Management
- [ ] Create batches (name + year)
- [ ] View all batches from teacher dashboard
- [ ] Assign students to a batch at account creation

### ✅ Student Management
- [ ] Teacher can add students manually (name, credentials, batch)
- [ ] Teacher can view the student list per batch
- [ ] Teacher can deactivate / reactivate student accounts

### ✅ Announcements
- [ ] Teacher can create an announcement targeted to a batch or all batches
- [ ] Teacher can edit and delete announcements
- [ ] Students see only their batch's announcements
- [ ] Announcements listed in reverse-chronological order
- [ ] Publication date/time shown

### ✅ Lessons
- [ ] Teacher can add a lesson by pasting a YouTube URL
- [ ] Auto-fetch of YouTube video title and thumbnail
- [ ] Teacher assigns lesson to one or more batches
- [ ] Students see only their batch's lessons
- [ ] Embedded YouTube player on lesson page
- [ ] Teacher can edit and delete lessons

### ✅ Student Portal
- [ ] Student home screen showing batch name and recent announcements
- [ ] Lessons browse page (flat ordered list)
- [ ] Lesson watch page with embedded YouTube player
- [ ] Mobile-responsive layout (320px minimum)

### ✅ General
- [ ] HTTPS enforced
- [ ] Basic input validation (server-side + client-side)
- [ ] Graceful error pages (404, 500, offline)

---

## 3. Post-MVP Features (Version 2+)

These are valuable but deliberately excluded from the initial build to reduce timeline and complexity. They should be revisited after the MVP is validated with real users.

| Feature | Reason Deferred |
|---------|-----------------|
| **Student self-registration** | Requires email verification or invite codes; teacher-managed enrolment is simpler for MVP. |
| **Lesson topics / modules** | Flat list is sufficient for a small initial library; grouping adds UI complexity. |
| **Drag-and-drop lesson reordering** | Nice-to-have; not critical on day one. |
| **Pinned announcements** | Useful but announcements are few enough in early days; recency ordering is fine. |
| **Announcement rich-text editor** | Plain text with basic markdown or HTML is acceptable for MVP. |
| **Batch archiving** | Needed once old batches accumulate (12–18 months away). |
| **Move student between batches** | Rare edge case; teacher can deactivate/re-add for now. |
| **Student progress tracking** | No video watch data collected in MVP. |
| **Search** | Library will be small; browsing is sufficient at launch. |
| **Email / SMS notifications** | Adds infrastructure; teacher uses WhatsApp for urgent comms. |
| **PWA / offline mode** | Desirable but non-trivial; defer until core is stable. |
| **Analytics dashboard** | Not needed until the platform has usage history. |
| **Multiple teacher accounts** | Single-teacher requirement for now. |
| **Assignment / quiz module** | Out of vision for now. |
| **Dark mode** | Cosmetic; can be added cheaply later. |

---

## 4. Development Priorities

The table below ranks MVP stories by impact and dependency order to guide sprint planning.

| Priority | Area | Stories | Rationale |
|----------|------|---------|-----------|
| **1 — Foundation** | Auth | T-AUTH-01, S-AUTH-01 | Nothing works without login. |
| **2 — Data model** | Batches + Students | T-BATCH-01, T-STU-01, T-STU-02, T-STU-03 | Must exist before content can be scoped. |
| **3 — Core content** | Lessons | T-LES-01, T-LES-02, T-LES-04, S-LES-01, S-LES-02 | Primary reason students use the platform. |
| **4 — Communication** | Announcements | T-ANN-01, T-ANN-02, T-ANN-03, S-ANN-01 | Replaces the WhatsApp group. |
| **5 — Polish** | Student UX + Navigation | S-NAV-01, S-NAV-02, S-ANN-01 | Mobile experience quality. |
| **6 — Safety** | Security + Validation | NFR-SEC01–05 | Must be baked in before first real use. |

---

## 5. Definition of Done (MVP)

The MVP is considered complete when:

1. The teacher can log in and manage at least two batches with students.
2. The teacher can add YouTube lesson links and assign them to batches.
3. The teacher can post announcements to specific or all batches.
4. A student can log in, see their batch, read announcements, and watch lessons.
5. The platform renders correctly on Chrome (Android), Safari (iOS), and a desktop browser.
6. No critical security vulnerabilities exist in the authentication or batch isolation flows.
7. Page load on a simulated 4G connection is under 3 seconds for the student home screen.

---

*Last updated: 2026-11-21*
