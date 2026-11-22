// components/announcements/AnnouncementPinButton.tsx
// Client button to toggle pinned status of an announcement.

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAnnouncementPin } from "@/actions/announcements";
import { Button } from "@/components/ui/button";
import { Pin, Loader2 } from "lucide-react";

interface AnnouncementPinButtonProps {
  announcementId: string;
  isPinned: boolean;
}

export function AnnouncementPinButton({
  announcementId,
  isPinned,
}: AnnouncementPinButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleToggle = () => {
    startTransition(async () => {
      const result = await toggleAnnouncementPin(announcementId, isPinned);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error ?? "Failed to update pinned status");
      }
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={isPending}
      onClick={handleToggle}
      title={isPinned ? "Unpin announcement" : "Pin announcement to top"}
      className={`h-8 w-8 p-0 transition-colors ${
        isPinned
          ? "text-amber-600 hover:text-amber-700 bg-amber-50"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Pin className={`h-4 w-4 ${isPinned ? "fill-current" : ""}`} />
      )}
      <span className="sr-only">{isPinned ? "Unpin" : "Pin"}</span>
    </Button>
  );
}
