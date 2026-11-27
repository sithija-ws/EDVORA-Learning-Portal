# Edvora Multi-Tenant SaaS — RLS Security Specification

> [!IMPORTANT]
> **Status**: PREPARATION-ONLY AUDITED SPECIFICATION.  
> Details the complete security architecture, threat model, and Row Level Security policy catalog for multi-tenant Edvora.

---

## 1. Threat Model & Defense-in-Depth

The multi-tenant architecture implements three coordinated defense layers:

```mermaid
flowchart TD
  ClientReq["Client Query / Mutation"] --> L1["Layer 1: Row Level Security (RLS)"]
  L1 -->|Permitted rows passed| L2["Layer 2: Engine Composite Integrity"]
  L2 -->|Foreign Key (id, tenant_id) Validated| L3["Layer 3: Subscription & Quota Triggers"]
  L3 -->|Quota and Status Verified| DBStore[("PostgreSQL Storage Engine")]
  
  subgraph EngineSecurity["Database Level Security Engine"]
    L1
    L2
    L3
  end
```

### Threat Vectors Mitigated

| Threat | Description | Mitigation Strategy |
| :--- | :--- | :--- |
| **Insecure Direct Object Reference (IDOR)** | Malicious client queries or updates another teacher's `batch_id` or `lesson_id`. | RLS restricts queries to caller's `tenant_id` membership; non-matching IDs return 0 rows. |
| **Cross-Tenant Junction Pollution** | Teacher A attempts to assign Teacher B's lesson to Teacher A's batch. | Composite foreign key `FOREIGN KEY (lesson_id, tenant_id) REFERENCES lessons(id, tenant_id)` physically rejects mismatch at the engine level. |
| **Admin Privilege Escalation** | Tenant admin promotes themselves or peers to `owner`. | Safety trigger `check_tenant_member_safety` and RLS `WITH CHECK` clauses restrict owner appointments strictly to current owners. |
| **Unauthenticated File Downloads** | Unauthenticated user downloads notes directly via public CDN URL. | Bucket `notes` set to private (`public = false`); all downloads mandate signed URLs or authenticated API requests. |
| **Commercial Quota Bypass** | Teacher attempts to enroll students beyond subscription tier. | Trigger `enforce_tenant_student_quota` dynamically checks distinct student count against active subscription plan. |
| **Expired Workspace Mutations** | Expired or suspended workspace continues creating resources. | Trigger `enforce_active_subscription_for_mutations` blocks content creation when subscription is inactive. |
| **Infinite Recursion / DoS** | RLS policy on table X queries table Y whose policy queries table X. | Helper functions run with `SECURITY DEFINER` and empty `search_path`, bypassing RLS inside evaluation routines. |

---

## 2. Role-Based Access Control (RBAC) Hierarchy

Roles within `public.tenant_members` follow a strict numeric hierarchy:

```
platform_admin (Global) > owner (40) > admin (30) > instructor (20) > assistant (10)
```

| Role | Scope | Capabilities |
| :--- | :--- | :--- |
| **`platform_admin`** | Global | Verify bank transfer slips, manage subscription tiers, suspend/reinstate workspaces, override student/storage quotas. |
| **`owner`** | Tenant | Workspace administration, billing/plan management, delete workspace, transfer ownership, manage all staff and resources. |
| **`admin`** | Tenant | Manage staff members (cannot create or demote owners), create/archive batches, manage student enrollments. |
| **`instructor`** | Tenant | Create and manage lessons, notes, and announcements; assign resources to batches. Read batches and enrollments. |
| **`assistant`** | Tenant | Post announcements, view student roster, view lessons, notes, and batches. Cannot create/modify batches, lessons, or notes. |
| **`student`** | Tenant | External portal user. Read-only access to published lessons, notes, and announcements strictly within enrolled, active batches. |

---

## 3. Row Level Security Policy Catalog

### 3.1 Core Tenant Entities

#### `public.tenants`
- `tenants_select_authorized`: `FOR SELECT TO authenticated USING (id IN (SELECT public.get_auth_tenant_ids()) OR public.is_tenant_student(id) OR public.is_platform_admin())`
- `tenants_update_owner`: `FOR UPDATE TO authenticated USING (public.has_tenant_role(id, 'owner') OR public.is_platform_admin())`
- `tenants_delete_owner`: `FOR DELETE TO authenticated USING (public.has_tenant_role(id, 'owner') OR public.is_platform_admin())`

#### `public.tenant_members`
- `tenant_members_select_member`: `FOR SELECT TO authenticated USING (tenant_id IN (SELECT public.get_auth_tenant_ids()) OR public.is_platform_admin())`
- `tenant_members_insert_admin`: `FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'admin') AND ((role = 'owner' AND public.has_tenant_role(tenant_id, 'owner')) OR (role != 'owner' AND public.has_tenant_role(tenant_id, 'admin'))))`
- `tenant_members_update_admin`: `FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'owner') OR (public.has_tenant_role(tenant_id, 'admin') AND role != 'owner' AND user_id != auth.uid())) WITH CHECK (public.has_tenant_role(tenant_id, 'owner') OR (public.has_tenant_role(tenant_id, 'admin') AND role != 'owner' AND user_id != auth.uid()))`
- `tenant_members_delete_admin`: `FOR DELETE TO authenticated USING ((public.has_tenant_role(tenant_id, 'owner') AND user_id != auth.uid()) OR (public.has_tenant_role(tenant_id, 'admin') AND role != 'owner' AND user_id != auth.uid()))`

#### `public.student_identities`
- `student_identities_select`: `FOR SELECT TO authenticated USING (public.has_tenant_role(tenant_id, 'assistant') OR student_id = auth.uid() OR public.is_platform_admin())`
- `student_identities_insert_admin`: `FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'admin'))`
- `student_identities_update_admin`: `FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin')) WITH CHECK (public.has_tenant_role(tenant_id, 'admin'))`
- `student_identities_delete_admin`: `FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'))`

---

### 3.2 Resource & Junction Entities

#### `public.batches` & `public.lessons` & `public.notes`
- `select_staff`: `FOR SELECT TO authenticated USING (public.has_tenant_role(tenant_id, 'assistant') OR public.is_platform_admin())`
- `select_student`: `FOR SELECT TO authenticated USING (public.is_enrolled_in_tenant_batch(batch_id) OR enrolled in lesson/note batch)`
- `insert/update_instructor`: `FOR INSERT/UPDATE TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'instructor'))`
- `delete_instructor/admin`: `FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, 'instructor'))`

#### `public.announcements` & `public.announcement_batches`
- `announcements_select_student`: Scoped to tenant broadcast (`NOT EXISTS announcement_batches AND is_tenant_student(tenant_id)`) OR batch-scoped (`EXISTS announcement_batches WHERE is_enrolled_in_tenant_batch(batch_id)`).
- `manage_assistant`: Assistants can post and update announcements.

#### `public.enrollments`
- `enrollments_select_staff`: Assistants and above can view roster.
- `enrollments_select_student`: Students can only view their own enrollments (`student_id = auth.uid()`).
- `enrollments_manage_admin`: Admins can enroll/unenroll students (subject to student quota triggers).

---

### 3.3 Storage Policies (`storage.objects` for bucket `'notes'`)
- **Bucket Visibility**: `public = false` (Private bucket).
- `notes_storage_upload_tenant`: `FOR INSERT TO authenticated WITH CHECK (bucket_id = 'notes' AND public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL AND public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'instructor') AND public.is_tenant_subscription_active(public.try_cast_uuid(split_part(name, '/', 1))))`
- `notes_storage_manage_tenant`: `FOR ALL TO authenticated USING/WITH CHECK (bucket_id = 'notes' AND public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'instructor'))`
- `notes_storage_select_tenant`: `FOR SELECT TO authenticated USING (bucket_id = 'notes' AND (legacy un-prefixed file OR staff of tenant OR enrolled student of tenant))`

---

### 3.4 Commercial Subscription Entities

#### `public.subscription_plans`
- `plans_select_active`: `FOR SELECT TO authenticated USING (is_active = true OR public.is_platform_admin())`
- `plans_manage_platform_admin`: `FOR ALL TO authenticated USING/WITH CHECK (public.is_platform_admin())`

#### `public.tenant_subscriptions`
- `tenant_subscriptions_select_staff`: `FOR SELECT TO authenticated USING (tenant_id IN (SELECT public.get_auth_tenant_ids()) OR public.is_platform_admin())`
- `tenant_subscriptions_manage_platform_admin`: `FOR ALL TO authenticated USING/WITH CHECK (public.is_platform_admin())` (Zero client modifications by teachers!).

#### `public.subscription_payments`
- `payments_select_tenant_admin`: `FOR SELECT TO authenticated USING (public.has_tenant_role(tenant_id, 'admin') OR public.is_platform_admin())`
- `payments_insert_tenant_admin`: `FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'admin') AND status = 'pending' AND verified_by IS NULL AND submitted_by = auth.uid())`
- `payments_update_platform_admin`: `FOR UPDATE TO authenticated USING/WITH CHECK (public.is_platform_admin())`
