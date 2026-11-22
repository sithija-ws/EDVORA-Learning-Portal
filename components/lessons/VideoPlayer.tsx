// components/lessons/VideoPlayer.tsx
// Privacy-respecting YouTube video player embedded via iframe with aspect ratio maintenance.

"use client";

import { useState } from "react";
import { buildEmbedUrl } from "@/lib/utils/youtube";
import { Loader2 } from "lucide-react";

interface VideoPlayerProps {
  youtubeId: string;
  title: string;
}

export function VideoPlayer({ youtubeId, title }: VideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const embedUrl = buildEmbedUrl(youtubeId);

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-neutral-950 border shadow-sm">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/80 text-white z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          <span className="text-xs text-neutral-400">Loading lesson video...</span>
        </div>
      )}

      <iframe
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        onLoad={() => setIsLoading(false)}
        className="w-full h-full border-0"
      />
    </div>
  );
}
