// components/lessons/LessonDeleteButton.tsx
// Client component button to delete a lesson with confirmation.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLesson } from "@/actions/lessons";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

interface LessonDeleteButtonProps {
  lessonId: string;
  lessonTitle: string;
  redirectTo?: string;
}

export function LessonDeleteButton({
  lessonId,
  lessonTitle,
  redirectTo,
}: LessonDeleteButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteLesson(lessonId);
      if (result.success) {
        if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } else {
        alert(result.error ?? "Failed to delete lesson");
        setShowConfirm(false);
      }
    });
  };

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-destructive font-medium">Delete?</span>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={handleDelete}
          className="h-7 text-xs px-2.5"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : null}
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setShowConfirm(false)}
          className="h-7 text-xs px-2"
        >
          Cancel
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
      title={`Delete ${lessonTitle}`}
      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
    >
      <Trash2 className="h-4 w-4" />
      <span className="sr-only">Delete lesson</span>
    </Button>
  );
}
