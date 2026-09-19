"use client";

import { useState } from "react";
import { ReadMoreCaptionModal } from "@/components/ReadMoreCaptionModal";
import { BIG_TEXT_MAX_LENGTH } from "@/lib/reels/generateTextCard";

export function CastReelCaptionCell({ caption }: { caption: string }) {
  const [open, setOpen] = useState(false);
  const isLong = caption.length > BIG_TEXT_MAX_LENGTH;

  return (
    <>
      <p className="line-clamp-2 text-[11px] text-white">
        {isLong ? `${caption.slice(0, BIG_TEXT_MAX_LENGTH)}…` : caption}
        {isLong && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-1 underline decoration-white/50 text-white/80"
          >
            続きを読む
          </button>
        )}
      </p>
      {open && <ReadMoreCaptionModal caption={caption} onClose={() => setOpen(false)} />}
    </>
  );
}
