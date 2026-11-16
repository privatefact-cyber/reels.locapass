"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unblockPetUser } from "@/app/pet/blockActions";
import { PetCard, petButton } from "./ui";

/** 設定: ブロックしている人の一覧と、解除 */
export function PetBlockedList({ users }: { users: { userId: string; label: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(users);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) return null;

  async function unblock(userId: string) {
    setBusyId(userId);
    setError(null);
    const res = await unblockPetUser(userId);
    setBusyId(null);
    if (!res.ok) return setError(res.error);
    setRows((r) => r.filter((x) => x.userId !== userId));
    router.refresh();
  }

  return (
    <PetCard className="mb-4">
      <h2 className="text-sm font-extrabold">ブロックしている人</h2>
      <p className="mt-1 text-xs text-[#9C8273]">この人たちの投稿は、あなたの画面に表示されません。</p>
      <ul className="mt-3 space-y-2">
        {rows.map((u) => (
          <li key={u.userId} className="flex items-center gap-2 rounded-2xl bg-[#FFFCF8] px-3 py-2">
            <span className="flex-1 truncate text-sm font-bold text-[#4A3426]">{u.label}</span>
            <button type="button" className={petButton.soft} disabled={busyId === u.userId} onClick={() => unblock(u.userId)}>
              {busyId === u.userId ? "…" : "解除"}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm font-bold text-[#D04848]">{error}</p>}
    </PetCard>
  );
}
