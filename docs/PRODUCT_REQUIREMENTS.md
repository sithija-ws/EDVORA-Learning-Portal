# Product Requirements Document — Edvora

**Version:** 1.0  
**Status:** Draft — Awaiting Stakeholder Approval  
**Date:** 2026-11-21  
**Author:** Business Analysis Team

---

## 1. Product Vision

Edvora is a focused, lightweight Learning Management System (LMS) built exclusively for a single Engineering Technology tuition teacher and their A/L students. It replaces informal communication channels (WhatsApp groups, shared drives, verbal announcements) with a structured, purpose-built web platform where the teacher can manage batches, deliver lessons, and communicate with students — all from one place.

---

## 2. Problem Statement

A/L tuition classes in Sri Lanka typically operate without dedicated software infrastructure. Teachers rely on:

- WhatsApp groups (cluttered, hard to organize by batch)
- Google Drive or YouTube playlists (no access control or structure)
- Verbal or SMS announcements (easy to miss, no history)

This creates friction for both teacher and students:

- Students from different batches (2026, 2027, 2028) receive irrelevant content.
- Lessons are hard to find and revisit after the fact.
- Announcements get buried in chat history.
- The teacher has no central dashboard to manage everything.

Edvora solves this by providing a simple, structured platform tailored to the real workflow of a local tuition class.

---

## 3. Goals

### Primary Goals

| Goal | Description |
|------|-------------|
| **Batch isolation** | Each A/L batch sees only content that is relevant to them. |
| **Lesson delivery** | The teacher can upload and organize unlisted YouTube lessons per batch. |
| **Announcements** | The teacher can post targeted or broadcast announcements. |
| **Student access** | Students can self-register or be enrolled and access content immediately. |
| **Mobile-first UX** | The platform must be fully usable on a typical Sri Lankan student's smartphone. |
| **Lightweight** | Pages must load acceptably on 3G/4G connections with low-end Android devices. |

### Non-Goals (Out of Scope)

| Non-Goal | Reason |
|----------|--------|
| Live video streaming | Complexity; YouTube already serves pre-recorded lessons. |
| Built-in video hosting | Storage cost and complexity; YouTube unlisted links are sufficient. |
| Automated payment/billing | Out of scope for MVP; tuition fees handled offline. |
| Multi-teacher support | Single teacher use case only for now. |
| Mobile native app (iOS/Android) | A responsive PWA is sufficient; native apps add significant overhead. |
| Discussion forums / comments | Increases moderation burden; WhatsApp still used for class discussion. |
| AI-driven features | No requirement identified at this stage. |
| Automated lesson transcription | Out of scope. |
| Grading / examinations | Not in the initial product vision. |

---

## 4. Functional Requirements

### 4.1 Authentication & Accounts

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-A01 | The system shall support two roles: **Teacher** and **Student**. | Must |
| FR-A02 | Students shall authenticate using a username/password or mobile number. | Must |
| FR-A03 | The teacher shall authenticate using a secure admin login. | Must |
| FR-A04 | The teacher account shall be a single, pre-configured account (no self-registration for teachers). | Must |
| FR-A05 | Student accounts shall be created by the teacher OR students can self-register (pending decision — see OPEN_QUESTIONS.md). | Should |
| FR-A06 | Sessions shall expire after a reasonable inactivity period. | Must |
| FR-A07 | Passwords shall be stored securely using hashing (bcrypt or equivalent). | Must |

### 4.2 Batch Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-B01 | The teacher shall be able to create a new A/L batch (e.g., "2027 Batch"). | Must |
| FR-B02 | The teacher shall be able to rename or archive a batch. | Should |
| FR-B03 | Each batch shall have a name, year, and optional description. | Must |
| FR-B04 | The teacher shall be able to view all batches from a central dashboard. | Must |
| FR-B05 | Archived batches shall remain accessible to the teacher but hidden from student login. | Should |

### 4.3 Student Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-S01 | The teacher shall be able to add a student to a batch. | Must |
| FR-S02 | The teacher shall be able to move a student between batches. | Should |
| FR-S03 | The teacher shall be able to view a list of all students per batch. | Must |
| FR-S04 | The teacher shall be able to deactivate a student's account. | Must |
| FR-S05 | Each student profile shall include: name, batch, contact information, and login credentials. | Must |

### 4.4 Announcements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AN01 | The teacher shall be able to create an announcement. | Must |
| FR-AN02 | An announcement shall be targetable to: a specific batch, multiple batches, or all batches. | Must |
| FR-AN03 | Announcements shall support rich text (bold, italic, lists, links at minimum). | Should |
| FR-AN04 | Announcements shall display a publication date/time. | Must |
| FR-AN05 | The teacher shall be able to edit and delete announcements. | Must |
| FR-AN06 | Students shall see only announcements addressed to their batch. | Must |
| FR-AN07 | Announcements shall be listed in reverse-chronological order. | Must |
| FR-AN08 | The teacher shall be able to pin an announcement to the top of the feed. | Could |

### 4.5 Lessons

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-L01 | The teacher shall be able to add a lesson by pasting a YouTube video URL. | Must |
| FR-L02 | The system shall embed the YouTube video using the YouTube IFrame Player API. | Must |
| FR-L03 | Each lesson shall have a title, optional description, and thumbnail. | Must |
| FR-L04 | The teacher shall be able to assign a lesson to one or multiple batches. | Must |
| FR-L05 | The teacher shall be able to organize lessons into topics or modules. | Should |
| FR-L06 | Lessons shall be listed in a browsable, ordered list per batch. | Must |
| FR-L07 | The teacher shall be able to reorder lessons within a module. | Should |
| FR-L08 | Students shall only see lessons assigned to their batch. | Must |
| FR-L09 | The teacher shall be able to edit and remove lessons. | Must |
| FR-L10 | Lesson thumbnails shall be auto-fetched from YouTube when a URL is pasted. | Should |

### 4.6 Student Experience

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SE01 | A student's home screen shall show their batch name and recent announcements. | Must |
| FR-SE02 | Students shall be able to browse all lessons available to their batch. | Must |
| FR-SE03 | Students shall be able to watch an embedded YouTube video within the platform. | Must |
| FR-SE04 | Navigation shall be clearly structured: Home, Lessons, Announcements. | Must |
| FR-SE05 | The student portal shall be read-only (no ability to post or upload). | Must |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement |
|----|-------------|
| NFR-P01 | Initial page load shall complete in under 3 seconds on a 4G connection. |
| NFR-P02 | The application shall function acceptably on devices with 2 GB RAM. |
| NFR-P03 | JavaScript bundle size shall be minimized; code-splitting shall be used where applicable. |
| NFR-P04 | Images and thumbnails shall be lazy-loaded. |

### 5.2 Responsiveness & Accessibility

| ID | Requirement |
|----|-------------|
| NFR-R01 | The UI shall be fully usable on screens from 320px wide upwards. |
| NFR-R02 | Touch targets shall meet WCAG 2.1 minimum size guidelines (44×44px). |
| NFR-R03 | Colour contrast shall meet WCAG 2.1 AA standard. |
| NFR-R04 | The platform shall function without horizontal scrolling on any supported screen size. |

### 5.3 Security

| ID | Requirement |
|----|-------------|
| NFR-SEC01 | All traffic shall be served over HTTPS. |
| NFR-SEC02 | API endpoints shall validate user authentication and authorization on every request. |
| NFR-SEC03 | Students shall not be able to access another batch's content through URL manipulation. |
| NFR-SEC04 | Sensitive data (passwords, tokens) shall never be logged. |
| NFR-SEC05 | The application shall protect against common web vulnerabilities (XSS, CSRF, SQL injection). |

### 5.4 Maintainability

| ID | Requirement |
|----|-------------|
| NFR-M01 | Code shall follow consistent style and linting rules. |
| NFR-M02 | The project shall include environment-based configuration (dev, staging, production). |
| NFR-M03 | The database schema shall be managed through migrations. |
| NFR-M04 | The codebase shall be documented enough for a single developer to onboard within one day. |

### 5.5 Reliability

| ID | Requirement |
|----|-------------|
| NFR-REL01 | The system shall target 99.5% uptime (excluding planned maintenance). |
| NFR-REL02 | The system shall gracefully handle YouTube API unavailability (e.g., show a message rather than crash). |

---

*Last updated: 2026-11-21*
