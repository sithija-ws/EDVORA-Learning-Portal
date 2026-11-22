// components/announcements/AnnouncementDeleteButton.tsx
// Client button to delete an announcement with confirmation.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAnnouncement } from "@/actions/announcements";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

interface AnnouncementDeleteButtonProps {
  announcementId: string;
  announcementTitle: string;
}

export function AnnouncementDeleteButton({
  announcementId,
  announcementTitle,
}: AnnouncementDeleteButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteAnnouncement(announcementId);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error ?? "Failed to delete announcement");
        setShowConfirm(false);
      }
    });
  };

  if (showConfirm) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-destructive font-medium">Delete?</span>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={handleDelete}
          className="h-7 text-xs px-2"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Yes
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setShowConfirm(false)}
          className="h-7 text-xs px-2"
        >
          No
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={() => setShowConfirm(true)}
      title={`Delete ${announcementTitle}`}
      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
    >
      <Trash2 className="h-4 w-4" />
      <span className="sr-only">Delete</span>
    </Button>
  );
}
