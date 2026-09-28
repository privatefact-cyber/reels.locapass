"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * キャスト/スタッフ本人が、ワンタイムパスワードから自分だけの6文字以上のパスワードへ
 * 切り替えるためのモーダル。初回ログイン時は呼び出し側が自動で開き(needs_password_setup)、
 * それ以外はメニューから手動で開ける。成功するとDB側のpassword_set_atが更新される
 * (set_own_password RPC。auth.updateUserではなくこちらを使うのは、店舗が再発行した
 * ワンタイムパスワードと本人設定パスワードを区別してフラグ管理するため)。
 */
export function PasswordSetupModal({
  open,
  onClose,
  forced = false,
}: {
  open: boolean;
  onClose: () => void;
  /** trueの場合、初回設定を促す文言にし、背景タップでは閉じない(×では閉じられる)。 */
  forced?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("パスワードは6文字以上にしてください");
      return;
    }
    if (password !== confirm) {
      setError("確認用パスワードが一致しません");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("set_own_password", { p_password: password });
    setLoading(false);

    if (rpcError) {
      setError("設定に失敗しました。時間をおいてもう一度お試しください。");
      return;
    }
    setDone(true);
  }

  function handleClose() {
    setPassword("");
    setConfirm("");
    setError(null);
    setDone(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center"
      onClick={() => {
        if (!forced) handleClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">パスワードを設定</h2>
          <button type="button" onClick={handleClose} className="text-sm text-muted">
            閉じる
          </button>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-emerald-400">パスワードを設定しました。</p>
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-full bg-gradient-to-r from-cta-gold-dark via-cta-gold to-cta-gold-light py-2 text-sm font-semibold text-on-cta-gold"
            >
              閉じる
            </button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs text-muted">
              {forced
                ? "店舗が発行したワンタイムパスワードのままです。安全のため、ご自身だけの新しいパスワード(6文字以上)を設定してください。"
                : "ログイン用のパスワードを変更できます(6文字以上)。"}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-muted">新しいパスワード</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-main/20 bg-main/5 px-3 py-2 text-[16px] text-main"
                />
              </div>
              <div>
                <label className="block text-xs text-muted">新しいパスワード(確認)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-main/20 bg-main/5 px-3 py-2 text-[16px] text-main"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-gradient-to-r from-cta-gold-dark via-cta-gold to-cta-gold-light py-2 text-sm font-semibold text-on-cta-gold disabled:opacity-60"
              >
                {loading ? "保存中..." : "パスワードを設定する"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
