"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteMurmur } from "@/app/dashboard/shop/[shopId]/murmurs/actions";

/** タイムラインの1件ずつに付く、小さな削除ボタン(投稿した本人と運営だけに出る)。 */
export function DeleteVoiceButton({ shopId, murmurId }: { shopId: string; murmurId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {error && <span className="text-[11px] text-red-500">{error}</span>}
      <button
        type="button"
        disabled={pending}
        aria-label="このVOICEを削除"
        onClick={() => {
          if (!confirm("このVOICEを削除しますか?")) return;
          setError(null);
          startTransition(async () => {
            const r = await deleteMurmur(shopId, murmurId);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
        className="text-tone-400 hover:text-red-500 disabled:opacity-40"
      >
        <Trash2 size={15} strokeWidth={1.75} />
      </button>
    </span>
  );
}
