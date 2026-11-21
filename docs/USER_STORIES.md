# User Stories — Edvora

**Version:** 1.0  
**Status:** Draft — Awaiting Stakeholder Approval  
**Date:** 2026-11-21

---

## Conventions

- Stories follow the format: **As a [role], I want to [action], so that [benefit].**
- Priority labels: `Must` · `Should` · `Could` · `Won't (MVP)`
- Each story includes **Acceptance Criteria (AC)** in Given / When / Then format.

---

## 1. Teacher User Stories

---

### Authentication

#### T-AUTH-01 — Secure Login
> *As the teacher, I want to log in with my credentials, so that I can access the admin dashboard securely.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I am on the login page,  
  **When** I enter my correct username and password and submit,  
  **Then** I am redirected to the teacher dashboard.
- **Given** I enter incorrect credentials,  
  **When** I submit the login form,  
  **Then** I see a clear error message and remain on the login page.
- **Given** I have been inactive for the session timeout period,  
  **When** I attempt to perform an action,  
  **Then** I am redirected to the login page and shown a session-expired message.

---

### Batch Management

#### T-BATCH-01 — Create a Batch
> *As the teacher, I want to create a new A/L batch, so that I can organize students and content by their exam year.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I am on the batch management page,  
  **When** I fill in a batch name (e.g., "2027 Batch") and save,  
  **Then** the new batch appears in my batch list.
- **Given** a batch name already exists,  
  **When** I try to create a duplicate,  
  **Then** I see a validation error preventing duplication.

#### T-BATCH-02 — Archive a Batch
> *As the teacher, I want to archive an old batch, so that it stays in my records but is not shown to students logging in.*

**Priority:** Should  
**Acceptance Criteria:**
- **Given** I archive a batch,  
  **Then** it no longer appears in the student login batch selection.
- **Given** I view archived batches in my dashboard,  
  **Then** I can still see the batch, its students, and its content.

---

### Student Management

#### T-STU-01 — Add a Student
> *As the teacher, I want to add a student to a batch, so that they can log in and access their batch content.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I am on the student management page for a batch,  
  **When** I fill in the student's name, contact info, and set a login credential,  
  **Then** the student appears in the batch list and can log in.
- **Given** I leave required fields blank,  
  **When** I submit the form,  
  **Then** validation errors are shown for each missing field.

#### T-STU-02 — View Students in a Batch
> *As the teacher, I want to see a list of all students in a batch, so that I can track enrolment.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I open a batch,  
  **Then** I see a list of enrolled students with their name and status (active/deactivated).

#### T-STU-03 — Deactivate a Student
> *As the teacher, I want to deactivate a student's account, so that they can no longer log in if they leave the class.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I deactivate a student,  
  **Then** that student cannot log in and sees an "Account disabled" message.
- **Given** I reactivate a deactivated student,  
  **Then** they can log in again normally.

#### T-STU-04 — Move a Student Between Batches
> *As the teacher, I want to move a student from one batch to another, so that I can correct enrolments without deleting and re-adding accounts.*

**Priority:** Should  
**Acceptance Criteria:**
- **Given** I move a student to a different batch,  
  **Then** they lose access to the old batch's content and gain access to the new batch's content.

---

### Announcements

#### T-ANN-01 — Post an Announcement
> *As the teacher, I want to post an announcement, so that students receive important updates.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I write an announcement and select target batches (or "All Batches"),  
  **When** I publish it,  
  **Then** it appears immediately in the announcement feed for the selected batches.
- **Given** I leave the announcement body empty,  
  **When** I try to publish,  
  **Then** I see a validation error.

#### T-ANN-02 — Edit an Announcement
> *As the teacher, I want to edit a published announcement, so that I can correct mistakes without deleting it.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I edit an announcement and save,  
  **Then** the updated content is shown to students immediately.
- **Given** an announcement has been edited,  
  **Then** an "Edited" indicator or timestamp is shown.

#### T-ANN-03 — Delete an Announcement
> *As the teacher, I want to delete an announcement, so that outdated or incorrect posts are removed.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I delete an announcement,  
  **When** I confirm the deletion prompt,  
  **Then** it is permanently removed from all feeds.

#### T-ANN-04 — Pin an Announcement
> *As the teacher, I want to pin an announcement to the top of the feed, so that critical information is always visible.*

**Priority:** Could  
**Acceptance Criteria:**
- **Given** I pin an announcement,  
  **Then** it appears at the top of the student announcement feed, visually distinguished from regular announcements.

---

### Lesson Management

#### T-LES-01 — Add a Lesson via YouTube URL
> *As the teacher, I want to add a lesson by pasting a YouTube link, so that students can watch recorded lessons inside the platform.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I paste a valid YouTube URL and provide a title,  
  **When** I save the lesson,  
  **Then** the lesson appears in my lesson list with an embedded video preview.
- **Given** I paste an invalid or non-YouTube URL,  
  **Then** I see a clear error message.
- **Given** the YouTube link is valid,  
  **Then** the thumbnail is auto-fetched and displayed.

#### T-LES-02 — Assign a Lesson to Batches
> *As the teacher, I want to assign a lesson to one or more batches, so that only relevant students see it.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I assign a lesson to Batch A and Batch B only,  
  **Then** only students in Batch A and Batch B can see that lesson.
- **Given** a lesson is unassigned to any batch,  
  **Then** no students can see it.

#### T-LES-03 — Organize Lessons into Topics
> *As the teacher, I want to group lessons under topic headings (e.g., "Unit 1: Forces"), so that the content is easy to navigate.*

**Priority:** Should  
**Acceptance Criteria:**
- **Given** I create a topic and add lessons to it,  
  **Then** students see lessons grouped under that topic heading.
- **Given** I drag or reorder lessons within a topic,  
  **Then** the new order is saved and reflected for students.

#### T-LES-04 — Edit or Remove a Lesson
> *As the teacher, I want to edit or remove a lesson, so that I can fix mistakes or remove outdated content.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I edit a lesson title or URL and save,  
  **Then** students see the updated details immediately.
- **Given** I delete a lesson,  
  **Then** it is removed from all batch lesson lists.

---

## 2. Student User Stories

---

### Authentication

#### S-AUTH-01 — Log In to the Platform
> *As a student, I want to log in with my credentials, so that I can access my batch's content.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I enter my correct credentials,  
  **When** I log in,  
  **Then** I am taken directly to my batch dashboard.
- **Given** my account has been deactivated,  
  **When** I try to log in,  
  **Then** I see a clear "Account disabled — please contact your teacher" message.
- **Given** I enter incorrect credentials,  
  **Then** I see a generic error (not revealing which field is wrong) and cannot log in.

---

### Announcements

#### S-ANN-01 — View Announcements
> *As a student, I want to see announcements from my teacher, so that I stay up to date with class information.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I open the announcements section,  
  **Then** I see announcements addressed to my batch or all batches, in reverse-chronological order.
- **Given** an announcement was targeted to a different batch only,  
  **Then** I cannot see it.
- **Given** an announcement has been pinned,  
  **Then** it appears at the top, visually differentiated.

---

### Lessons

#### S-LES-01 — Browse Lessons
> *As a student, I want to browse the lessons available for my batch, so that I can find what I need to study.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I open the Lessons section,  
  **Then** I see lessons grouped by topic (if topics are defined) or in a flat ordered list.
- **Given** a lesson belongs only to another batch,  
  **Then** I cannot see or access it.

#### S-LES-02 — Watch a Lesson Video
> *As a student, I want to watch a lesson video embedded in the platform, so that I don't have to leave to YouTube.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I open a lesson,  
  **Then** I see the lesson title, description, and an embedded YouTube player.
- **Given** I am on a mobile device,  
  **Then** the video player is responsive and fills the screen width appropriately.
- **Given** YouTube is unreachable,  
  **Then** I see a helpful message rather than a broken page.

---

### Navigation & General

#### S-NAV-01 — Navigate the Platform on Mobile
> *As a student, I want to navigate the platform easily on my phone, so that I can use it daily without frustration.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I am on a 320px–375px wide screen,  
  **Then** all navigation items, text, and buttons are readable and tappable without zooming.
- **Given** I use the navigation menu,  
  **Then** I can reach Home, Lessons, and Announcements within two taps.

#### S-NAV-02 — View My Batch Information
> *As a student, I want to see which batch I belong to on my home screen, so that I know my account is correctly set up.*

**Priority:** Must  
**Acceptance Criteria:**
- **Given** I log in,  
  **Then** my home screen clearly displays my batch name (e.g., "2027 Batch").

---

*Last updated: 2026-11-21*
