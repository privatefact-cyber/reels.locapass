"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deletePetDiary, deletePetDocument, deletePetMedical } from "@/app/pet/actions";
import { deleteLocalImages } from "./localImages";

const ACTIONS = { document: deletePetDocument, medical: deletePetMedical, diary: deletePetDiary };

export function PetDeleteButton({ kind, id, label = "削除", localRefs = [] }: { kind: keyof typeof ACTIONS; id: string; label?: string; localRefs?: (string | null)[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm("この記録を削除します。よろしいですか?")) return;
        setBusy(true);
        const res = await ACTIONS[kind](id);
        setBusy(false);
        if (!res.ok) alert(res.error);
        else {
          await deleteLocalImages(localRefs); // 端末内に保存した画像も消す
          router.refresh();
        }
      }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-[#C9B3A3] active:scale-95"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      {label}
    </button>
  );
}
