// app/(student)/home/notes/page.tsx
// Student notes directory — displays PDF study materials and handouts for enrolled batches.

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { NoteCard } from "@/components/notes/NoteCard";
import type { Note, Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Study Notes – Edvora",
};

interface StudentNotesPageProps {
  searchParams: Promise<{ batchId?: string }>;
}

export default async function StudentNotesPage({
  searchParams,
}: StudentNotesPageProps) {
  const { batchId } = await searchParams;
  const supabase = await createServerClient();

  // 1. Authenticate student
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Fetch profile, enrolled batches, and tenant identities concurrently in parallel
  const [{ data: profile }, { data: enrollments }, { data: identities }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_active, role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("enrollments")
      .select("batch_id, tenant_id")
      .eq("student_id", user.id),
    supabase
      .from("student_identities")
      .select("tenant_id")
      .eq("student_id", user.id),
  ]);

  if (!profile || !profile.is_active) {
    redirect("/disabled");
  }

  const enrolledBatchIds = enrollments?.map((e) => e.batch_id) ?? [];
  const studentTenantIds = Array.from(
    new Set([
      ...(identities?.map((i) => i.tenant_id) ?? []),
      ...((enrollments?.map((e) => e.tenant_id).filter(Boolean) as string[]) ?? []),
    ])
  );

  if (enrolledBatchIds.length === 0 || studentTenantIds.length === 0) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <PageHeader
          title="Study Notes"
          description="Access your PDF handouts, theory summaries, and revision guides."
        />
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <h3 className="font-bold text-foreground text-sm">
            Not enrolled in any batches yet
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Your instructor will enroll you into a tuition batch to access class notes.
          </p>
        </div>
      </div>
    );
  }

  // 3. Shield student catalog for expired workspaces (SEC-3B2C-INFO-01)
  const { data: tenantSubs } = await supabase
    .from("tenant_subscriptions")
    .select("tenant_id, status, current_period_end, trial_ends_at")
    .in("tenant_id", studentTenantIds);

  const now = new Date();
  const activeTenantIds = new Set(
    tenantSubs
      ?.filter((sub) => {
        const isPeriodActive =
          sub.status === "active" &&
          sub.current_period_end &&
          new Date(sub.current_period_end) > now;
        const isTrialActive =
          sub.status === "trialing" &&
          sub.trial_ends_at &&
          new Date(sub.trial_ends_at) > now;
        return isPeriodActive || isTrialActive;
      })
      .map((sub) => sub.tenant_id) ?? []
  );

  if (activeTenantIds.size === 0) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <PageHeader
          title="Study Notes"
          description="Access your PDF handouts, theory summaries, and revision guides."
        />
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-10 text-center text-foreground space-y-3">
          <FileText className="h-8 w-8 mx-auto text-destructive" />
          <h3 className="font-bold text-base text-foreground">
            Workspace Access Inactive
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Your tuition academy&apos;s trial or subscription is currently inactive. Note downloads are paused until your instructor renews their workspace subscription.
          </p>
        </div>
      </div>
    );
  }

  const authorizedTenantIds = Array.from(activeTenantIds);

  // Selected batch filter
  const effectiveBatchFilter =
    batchId && enrolledBatchIds.includes(batchId) ? batchId : null;

  // 4. Stage 2 concurrent fetch: enrolled batches and note assignments in parallel scoped to active tenants
  const [{ data: enrolledBatchesData }, { data: noteBatchesData }] =
    await Promise.all([
      supabase
        .from("batches")
        .select("*")
        .in("id", enrolledBatchIds)
        .in("tenant_id", authorizedTenantIds)
        .order("year", { ascending: false }),
      supabase
        .from("note_batches")
        .select("note_id, batch_id")
        .in(
          "batch_id",
          effectiveBatchFilter ? [effectiveBatchFilter] : enrolledBatchIds
        )
        .in("tenant_id", authorizedTenantIds),
    ]);

  const enrolledBatches: Batch[] = enrolledBatchesData ?? [];
  const batchMap = new Map(enrolledBatches.map((b) => [b.id, b]));

  const noteToBatchesMap = new Map<string, Batch[]>();
  const noteIdSet = new Set<string>();

  noteBatchesData?.forEach((nb) => {
    noteIdSet.add(nb.note_id);
    const b = batchMap.get(nb.batch_id);
    if (b) {
      const existing = noteToBatchesMap.get(nb.note_id) || [];
      existing.push(b);
      noteToBatchesMap.set(nb.note_id, existing);
    }
  });

  const noteIds = Array.from(noteIdSet);
  let notes: Note[] = [];

  if (noteIds.length > 0) {
    const { data: notesData } = await supabase
      .from("notes")
      .select("*")
      .in("id", noteIds)
      .in("tenant_id", authorizedTenantIds)
      .order("created_at", { ascending: false });

    notes = notesData ?? [];
  }

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-6 pb-0">
        <PageHeader
          title="Study Notes & Handouts"
          description="Read and study PDF handouts, chapter guides, and tutorial sheets."
        />

        {/* Multi-batch filter tabs */}
        {enrolledBatches.length > 1 && (
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <Link
              href="/home/notes"
              className={`rounded-full px-3 py-1 font-semibold transition-all shrink-0 ${
                !effectiveBatchFilter
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All Notes ({notes.length})
            </Link>

            {enrolledBatches.map((b) => {
              const isActive = effectiveBatchFilter === b.id;
              return (
                <Link
                  key={b.id}
                  href={`/home/notes?batchId=${b.id}`}
                  className={`rounded-full px-3 py-1 font-semibold transition-all shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {b.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6 pt-2">
        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
            <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="font-bold text-foreground text-sm">
              No notes uploaded yet
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Your instructor has not uploaded any PDF study materials for this batch yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                batches={noteToBatchesMap.get(note.id) ?? []}
                role="student"
                href={`/home/notes/${note.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
