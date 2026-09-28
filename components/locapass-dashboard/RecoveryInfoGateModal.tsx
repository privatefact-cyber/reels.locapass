"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 店舗管理者(shop_admin)の初回ログイン時に、ID/パスワードを忘れたときの自己復旧に使う
 * 電話番号・生年月日・4桁PINの登録を必須にするゲート。閉じるボタンは無く、
 * 登録が終わるまでダッシュボードの他の画面には進めない
 * (ユーザー方針: 店舗コードは忘れる担当者がいるため、本人の電話番号+生年月日+PINの
 * 3項目一致に統一し、未登録の状態そのものを無くす)。
 */
export function RecoveryInfoGateModal() {
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^[0-9]{4}$/.test(pin)) {
      setError("PINは数字4桁で入力してください");
      return;
    }
    if (pin !== pinConfirm) {
      setError("PIN(確認)が一致しません");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    // set_locapass_shop_admin_recovery_info はDBには存在するが、生成済みのtypes/supabase.tsが
    // 巨大すぎて自動編集ツールがタイムアウトするため型定義への追記を見送っている。ここだけ型を緩める
    // (supabase自体をanyにcastして呼ぶ。.rpcだけ切り離すとthisが外れてクライアント内部が壊れるため注意)。
    const { error: rpcError } = await (supabase as any).rpc("set_locapass_shop_admin_recovery_info", {
      p_phone: phone,
      p_birth_date: birthDate,
      p_pin: pin,
    });
    setLoading(false);

    if (rpcError) {
      setError("登録に失敗しました。入力内容を確認してもう一度お試しください。");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-900">登録しました。</p>
          <p className="mt-2 text-xs text-slate-500">
            次回ID/パスワードを忘れた際は、この電話番号・生年月日・PINでご自身で再発行できます。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            続ける
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <h2 className="text-sm font-bold text-slate-900">ログイン復旧情報の登録(必須)</h2>
        <p className="mt-2 text-xs text-slate-500">
          今後ログインID・パスワードを忘れた際に、運営に問い合わせず自分で再発行できるようにするための登録です。最初に一度だけお願いしています。
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500">ご担当者様の電話番号</label>
            <input
              type="tel"
              required
              placeholder="09012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">ご担当者様の生年月日</label>
            <input
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">4桁のPIN(ご自身で決めてください)</label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              placeholder="1234"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] tracking-widest text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">PIN(確認)</label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              placeholder="1234"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] tracking-widest text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <p className="text-[11px] text-slate-400">
            ※電話番号・生年月日・PINは、運営を含め他の誰にも公開されません。忘れると自己復旧ができなくなるため、必ず控えてください。
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "登録中..." : "登録して続ける"}
          </button>
        </form>
      </div>
    </div>
  );
}
