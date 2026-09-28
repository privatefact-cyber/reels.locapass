"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 店舗が発行したリンク+6桁PINでマイページへログインする。
 * URLだけでは入れない(漏洩対策)。PINは店舗ダッシュボードで発行され、5回間違えると30分ロックされる。
 * 成功のたびにパスワードが更新される(リンクとPINが有効な限り何度でも使える)。
 *
 * このリンクをブックマークして再訪した時、既にログイン済みならPIN再入力なしで
 * そのままマイページへ通す(マイページへの入口がこのリンク以外に無いため)。
 */
export default function StaffLoginLinkPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("locapass_current_staff_member_id").then(({ data }) => {
      if (data) {
        router.replace("/staff/mypage");
        return;
      }
      setCheckingSession(false);
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || pin.length !== 6) return;
    setBusy(true);
    setMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .rpc("locapass_redeem_staff_login_token", { p_token: params.token, p_pin: pin })
      .single();

    if (error || !data) {
      setMessage("ログインできませんでした。時間をおいてもう一度お試しください。");
      setBusy(false);
      return;
    }
    if (data.status === "locked") {
      setMessage("暗証番号を続けて間違えたため、30分ロックしました。時間をおくか、店舗にお問い合わせください。");
      setBusy(false);
      return;
    }
    if (data.status === "wrong_pin") {
      setMessage("暗証番号が違います。");
      setPin("");
      setBusy(false);
      return;
    }
    if (data.status !== "ok") {
      setMessage("このリンクは無効です。店舗の担当者に最新のリンクと暗証番号を再発行してもらってください。");
      setBusy(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.login_email,
      password: data.one_time_password,
    });
    if (signInError) {
      setMessage("ログインできませんでした。時間をおいてもう一度お試しください。");
      setBusy(false);
      return;
    }

    router.push("/staff/mypage");
    router.refresh();
  }

  if (checkingSession) {
    return <div className="mx-auto max-w-sm px-4 py-10 text-center text-sm text-muted">確認中...</div>;
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10 text-center">
      <h1 className="text-lg font-bold">マイページにログイン</h1>
      <p className="mt-2 text-sm text-muted">店舗から教えてもらった6桁の暗証番号を入力してください。</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="000000"
          className="w-full rounded border border-black/20 px-3 py-3 text-center text-2xl tracking-[0.5em] text-black"
        />
        <button
          type="submit"
          disabled={busy || pin.length !== 6}
          className="w-full rounded bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "確認中..." : "ログイン"}
        </button>
        {message && <p className="text-sm text-red-600">{message}</p>}
      </form>
    </div>
  );
}
