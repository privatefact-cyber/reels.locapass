"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMurmur } from "./actions";

export function DeleteMurmurButton({ shopId, murmurId }: { shopId: string; murmurId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("このひとことを削除しますか?")) return;
          setError(null);
          startTransition(async () => {
            const r = await deleteMurmur(shopId, murmurId);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 active:bg-red-50 disabled:opacity-50"
      >
        {pending ? "削除中…" : "削除"}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}
