# Project Glossary — Edvora

**Version:** 1.0  
**Status:** Living Document — Update as terminology evolves  
**Date:** 2026-11-21

---

This glossary defines the canonical terms used across all Edvora documentation, designs, and codebase. All team members, documents, and code must use these terms consistently to avoid ambiguity.

---

## Core Entities

| Term | Definition |
|------|------------|
| **Edvora** | The name of the platform. |
| **Teacher** | The single administrator and content creator of the platform. The teacher manages batches, students, lessons, and announcements. Referred to in code as `role: "teacher"` or `role: "admin"`. |
| **Student** | An enrolled learner who belongs to exactly one batch. Students have read-only access to content assigned to their batch. Referred to in code as `role: "student"`. |
| **Batch** | A cohort of students grouped by their A/L examination year (e.g., "2027 Batch"). A batch is the primary unit of content and audience targeting in Edvora. |
| **Active Batch** | A batch that is currently accepting new students and whose content is accessible to enrolled students. |
| **Archived Batch** | A batch that has completed its academic cycle. It remains visible to the teacher for records but is hidden from the student-facing login flow. |
| **Enrolment** | The act of assigning a student to a batch. A student is *enrolled* in a batch. |

---

## Content

| Term | Definition |
|------|------------|
| **Lesson** | A single educational video unit within Edvora, consisting of a title, an optional description, a YouTube video embed, and a thumbnail. |
| **YouTube URL** | The external link to a YouTube video (may be unlisted or public) that the teacher provides when creating a lesson. |
| **Lesson Topic** | (Post-MVP) A named grouping of lessons within a batch, equivalent to a chapter or unit (e.g., "Unit 1: Forces"). Also called a *Module*. |
| **Announcement** | A text-based message posted by the teacher, addressed to one or more batches. Announcements appear on the student's home screen in reverse-chronological order. |
| **Pinned Announcement** | (Post-MVP) An announcement that the teacher has elevated to always appear at the top of the feed. |
| **Broadcast Announcement** | An announcement targeted to *all* batches simultaneously. |
| **Targeted Announcement** | An announcement addressed to one or more specific batches only. |

---

## Access & Accounts

| Term | Definition |
|------|------------|
| **Account** | A user record in the Edvora system, belonging to either a Teacher or a Student. |
| **Credentials** | The login username and password combination for an account. |
| **Session** | An authenticated browser session started upon successful login. Sessions expire after a configured period of inactivity. |
| **Active Account** | An account that is enabled and can log in. |
| **Deactivated Account** | A student account that the teacher has disabled. The student cannot log in but their data is not deleted. |
| **Role** | The permission level of an account. Two roles exist: `teacher` (full admin access) and `student` (read-only access to their batch). |

---

## Platform Areas

| Term | Definition |
|------|------------|
| **Teacher Dashboard** | The primary view after the teacher logs in. Shows all batches and quick navigation to management functions. |
| **Student Dashboard / Home Screen** | The primary view after a student logs in. Shows their batch name and recent announcements. |
| **Batch Page (Teacher)** | The teacher's view of a specific batch, showing enrolled students, assigned lessons, and announcements. |
| **Lessons Page (Student)** | The student-facing browse view of lessons available to their batch. |
| **Lesson Page (Student)** | The student-facing view of a single lesson, including the embedded YouTube player. |
| **Announcements Page (Student)** | The student-facing list of announcements relevant to their batch. |

---

## Technical Terms

| Term | Definition |
|------|------------|
| **Batch Isolation** | The security principle ensuring that a student can only access content (lessons, announcements) assigned to their own batch. |
| **YouTube IFrame Player API** | Google's official JavaScript API for embedding YouTube videos within a web page. Used by Edvora to embed lesson videos. |
| **Unlisted Video** | A YouTube video that is accessible only via its direct link and does not appear in search results or the uploader's public channel. Edvora lessons are expected to use unlisted videos to prevent unauthorised access. |
| **Thumbnail** | The preview image of a YouTube video, auto-fetched via the YouTube image CDN when a lesson is created. |
| **Migration** | A versioned database schema change script. All changes to the database structure must be made via migrations. |
| **Seed** | An initial data script that populates the database with required starting data (e.g., the teacher account). |
| **Environment** | A deployment context: `development` (local), `staging` (test/preview), or `production` (live). |
| **Route / Endpoint** | A URL path in the application that responds to a user action or API request. |

---

## Naming Conventions

| Entity | Singular | Plural | Example |
|--------|----------|--------|---------|
| Batch | Batch | Batches | "2027 Batch" |
| Student | Student | Students | — |
| Lesson | Lesson | Lessons | "Introduction to Forces" |
| Announcement | Announcement | Announcements | — |
| Topic | Topic | Topics | "Unit 1: Mechanics" |

---

## Avoided Terms

The following terms are deliberately **not used** to avoid confusion with other systems. Use the preferred term instead.

| Avoid | Use instead | Reason |
|-------|-------------|--------|
| "Class" | "Batch" | "Class" is ambiguous (could mean a session or a year group). |
| "Course" | "Batch" or "Lesson Topic" | "Course" implies a formal enrolment-based product; Edvora is simpler. |
| "Video" | "Lesson" | A lesson is the full content unit; "video" refers only to the media component. |
| "Admin" | "Teacher" | The user is a teacher, not a generic admin; use their real role. |
| "User" | "Teacher" or "Student" | Be specific to avoid ambiguity in documentation and code comments. |
| "Content" (generic) | "Lesson" or "Announcement" | Use the specific entity name rather than a vague catch-all. |
| "Module" | "Topic" | "Topic" is more intuitive for a tuition context. ("Module" reserved for post-MVP if re-evaluated.) |

---

*Last updated: 2026-11-21*
