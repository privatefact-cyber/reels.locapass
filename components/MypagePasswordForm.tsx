"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function MypagePasswordForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (password.length < 6) {
      setMessage({ type: "error", text: "パスワードは6文字以上にしてください" });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: "error", text: "確認用パスワードが一致しません" });
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    setPassword("");
    setConfirm("");
    setMessage({ type: "success", text: "パスワードを設定しました" });
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <div>
        <label className="block text-xs text-neutral-400">新しいパスワード</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-400">新しいパスワード(確認)</label>
        <input
          type="password"
          required
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
        />
      </div>
      {message && (
        <p className={`text-xs ${message.type === "error" ? "text-red-400" : "text-emerald-400"}`}>
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-gradient-to-r from-gold-dark via-gold to-gold-light py-2 text-sm font-semibold text-black disabled:opacity-60"
      >
        {loading ? "保存中..." : "パスワードを設定する"}
      </button>
    </form>
  );
}
