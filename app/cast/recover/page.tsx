"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CastRecoverPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    // 一致しないときは0行(→ .single() がエラー)、同じ電話番号で失敗が続いて
    // 一時的にロックされているときは login_email が null の1行が返る(DB側で24時間に5回まで)。
    const { data, error: recoverError } = await supabase
      .rpc("recover_cast_login", { p_phone: phone, p_birth_date: birthDate })
      .single();

    if (data && !data.login_email) {
      setLoading(false);
      setError("確認の回数が上限に達しました。時間をおいて再度お試しいただくか、店舗の担当者にご確認ください。");
      return;
    }

    if (recoverError || !data) {
      setLoading(false);
      setError("入力内容が登録情報と一致しませんでした。店舗の担当者にご確認ください。");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.login_email,
      password: data.one_time_password,
    });

    setLoading(false);
    if (signInError) {
      setError("入力内容が登録情報と一致しませんでした。店舗の担当者にご確認ください。");
      return;
    }

    router.push("/cast/mypage");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <h1 className="text-xl font-bold">ログインできない方</h1>
      <p className="mt-1 text-sm text-neutral-400">
        登録済みの電話番号と生年月日を入力してください。一致すればそのままマイページにログインできます。
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
            className="mt-1 w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">生年月日</label>
          <input
            type="date"
            required
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="mt-1 w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? "確認中..." : "本人確認してログイン"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <a href="/cast/login" className="text-neutral-400 underline hover:text-white">
          ログイン画面に戻る
        </a>
      </p>
    </div>
  );
}
