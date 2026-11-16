"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deletePetAccount } from "@/app/pet/accountActions";
import { PetCard, petButton, petInput } from "./ui";

/**
 * アカウント削除(取り消せない)。App Store の審査で、アプリの中から退会できることが必須。
 * hasRoles: 店舗管理者・キャスト・契約者など他サービスの役割がある人。アカウントは残し、ロカわんのデータだけ消す。
 */
export function PetDeleteAccount({ hasRoles }: { hasRoles: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneData, setDoneData] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await deletePetAccount(confirm);
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    if (res.mode === "full") {
      try {
        await createClient().auth.signOut();
      } catch {
        // アカウントはもう無いので、ログアウトに失敗しても問題ない
      }
      window.location.href = "/pet/login?deleted=1";
      return;
    }
    setBusy(false);
    setDoneData(true);
  }

  if (doneData) {
    return (
      <PetCard className="mt-8 bg-[#E5F8EC] text-sm font-bold text-[#06A34A]">
        ロカわんのデータを削除しました。アカウント自体の削除は、LOCAPASSのサポートへご連絡ください。
        <button type="button" className={`${petButton.soft} mt-3 w-full`} onClick={() => (window.location.href = "/pet")}>
          ホームにもどる
        </button>
      </PetCard>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-8 block w-full text-center text-xs font-bold text-[#C9B3A3] underline">
        アカウントを削除する
      </button>
    );
  }

  return (
    <PetCard className="mt-8 border-[#FFD0D0]">
      <h2 className="text-[15px] font-extrabold text-[#D04848]">アカウントを削除する</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[#7A6050]">次のデータが削除され、元に戻せません。</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-[#7A6050]">
        <li>うちの子のプロフィール、成長日誌、通院の記録</li>
        <li>書類の写真(狂犬病・ワクチンの証明など)</li>
        <li>迷子のお知らせ、「見つけました」の通報、目撃情報</li>
        <li>自慢ギャラリーや地図への投稿、通知・LINE連携の設定</li>
        {!hasRoles && <li>ログイン情報(LOCAPASSのアカウントごと削除されます)</li>}
      </ul>
      {hasRoles && (
        <p className="mt-3 rounded-2xl bg-[#FFF8E1] p-3 text-[12px] font-bold leading-relaxed text-[#8A6A00]">
          このアカウントは、店舗やキャストなどの用途でも使われているため、ロカわんのデータだけを削除し、アカウントは残ります。アカウント自体の削除は、サポートへご連絡ください。
        </p>
      )}
      <label className="mt-4 block">
        <span className="mb-1 block px-1 text-[13px] font-bold text-[#7A6050]">確認のため「削除」と入力してください</span>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={petInput} placeholder="削除" autoComplete="off" />
      </label>
      {error && <p className="mt-2 px-1 text-sm font-bold text-[#D04848]">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" className={`${petButton.ghost} flex-1`} onClick={() => { setOpen(false); setConfirm(""); setError(null); }} disabled={busy}>
          やめる
        </button>
        <button type="button" className={`${petButton.danger} flex-1`} onClick={run} disabled={busy || confirm.trim() !== "削除"}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          {busy ? "削除中…" : "削除する"}
        </button>
      </div>
    </PetCard>
  );
}
