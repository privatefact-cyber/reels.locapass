"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 加盟店ログインの自己復旧。IDやパスワードを忘れても運営に問い合わせなくて済むようにする
 * (キャストの電話番号+生年月日での自己復旧と同じ考え方、app/cast/recover/page.tsx参照)。
 * 本人確認は「店舗コード」+「登録電話番号」の組み合わせ(どちらも店舗自身が把握している)。
 */
export default function ShopLoginRecoverPage() {
  const router = useRouter();
  const [shopCode, setShopCode] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    // 一致しないときは0行(→.single()がエラー)、失敗が続いて一時的にロックされているときは
    // login_emailがnullの1行が返る(DB側で24時間に5回まで、recover_shop_login参照)。
    const { data, error: recoverError } = await supabase
      .rpc("recover_shop_login", { p_shop_code: shopCode, p_phone: phone })
      .single();

    if (data && !data.login_email) {
      setLoading(false);
      setError("確認の回数が上限に達しました。時間をおいて再度お試しいただくか、運営者にご確認ください。");
      return;
    }

    if (recoverError || !data) {
      setLoading(false);
      setError("入力内容が登録情報と一致しませんでした。店舗コード・電話番号をご確認のうえ、それでも解決しない場合は運営者にご確認ください。");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.login_email,
      password: data.one_time_password,
    });

    setLoading(false);
    if (signInError) {
      setError("入力内容が登録情報と一致しませんでした。店舗コード・電話番号をご確認のうえ、それでも解決しない場合は運営者にご確認ください。");
      return;
    }

    // 通常の/loginログインと同じ着地先に揃える。
    router.push("/dashboard/applicants");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <h1 className="text-xl font-bold">ログインできない方</h1>
      <p className="mt-1 text-sm text-slate-600">
        店舗コードと登録済みの電話番号を入力してください。一致すればそのままログインできます
        (ログインIDとパスワードは新しく発行されます)。
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">店舗コード</label>
          <input
            type="text"
            required
            placeholder="例: 4SW7CG"
            value={shopCode}
            onChange={(e) => setShopCode(e.target.value)}
            className="mt-1 w-full rounded border border-black/20 bg-white px-3 py-2 text-[16px] text-black"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">登録電話番号</label>
          <input
            type="tel"
            required
            placeholder="0312345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded border border-black/20 bg-white px-3 py-2 text-[16px] text-black"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
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
