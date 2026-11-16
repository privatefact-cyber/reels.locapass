"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** ロカわんの設定画面のログアウト。サインアウト後は全体を読み直して、ログイン画面へ戻す。 */
export function PetSignOutButton() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await createClient().auth.signOut();
    } finally {
      window.location.href = "/pet/login";
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-[#F1E1CF] bg-white py-3.5 text-sm font-bold text-[#9C8273] shadow-[0_6px_20px_-12px_rgba(122,80,40,0.35)] disabled:opacity-60"
    >
      <LogOut size={16} aria-hidden />
      {busy ? "ログアウト中…" : "ログアウト"}
    </button>
  );
}
