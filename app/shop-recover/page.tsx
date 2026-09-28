"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** 店舗管理者(shop_admin)がID/パスワードを忘れた場合のセルフ復旧。/cast/recover と同じ設計。 */
export default function ShopAdminRecoverPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    // recover_locapass_shop_admin_login はDBには存在するが、生成済みのtypes/supabase.tsが
    // 巨大すぎて自動編集ツールがタイムアウトするため型定義への追記を見送っている。ここだけ型を緩める
    // (supabase自体をanyにcastして呼ぶ。.rpcだけ切り離すとthisが外れてクライアント内部が壊れるため注意)。
    // 一致しないときは0行(→ .single() がエラー)、同じ電話番号で失敗が続いて
    // 一時的にロックされているときは login_email が null の1行が返る(DB側で24時間に5回まで)。
    const { data, error: recoverError } = (await (supabase as any)
      .rpc("recover_locapass_shop_admin_login", {
        p_phone: phone,
        p_birth_date: birthDate,
        p_pin: pin,
      })
      .single()) as { data: { login_email: string; one_time_password: string } | null; error: { message: string } | null };

    if (data && !data.login_email) {
      setLoading(false);
      setError("確認の回数が上限に達しました。時間をおいて再度お試しいただくか、運営にご確認ください。");
      return;
    }

    if (recoverError || !data) {
      setLoading(false);
      setError("入力内容が登録情報と一致しませんでした。運営にご確認ください。");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.login_email,
      password: data.one_time_password,
    });

    setLoading(false);
    if (signInError) {
      setError("入力内容が登録情報と一致しませんでした。運営にご確認ください。");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <h1 className="text-xl font-bold">店舗管理者の方でログインできない場合</h1>
      <p className="mt-1 text-sm text-slate-500">
        ダッシュボード初回ログイン時に登録した、電話番号・生年月日・4桁PINを入力してください。一致すればそのまま管理画面にログインできます。
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">電話番号</label>
          <input
            type="tel"
            required
            placeholder="09012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded border border-black/20 bg-white px-3 py-2 text-[16px] text-black"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">生年月日</label>
          <input
            type="date"
            required
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="mt-1 w-full rounded border border-black/20 bg-white px-3 py-2 text-[16px] text-black"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">4桁のPIN</label>
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            required
            placeholder="1234"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            className="mt-1 w-full rounded border border-black/20 bg-white px-3 py-2 text-[16px] tracking-widest text-black"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "確認中..." : "本人確認してログイン"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <a href="/login" className="text-slate-500 underline hover:text-slate-900">
          ログイン画面に戻る
        </a>
      </p>
    </div>
  );
}
