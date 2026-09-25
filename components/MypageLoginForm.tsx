"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MypageLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/mypage";

  const [mode, setMode] = useState<"link" | "password">("link");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("line_error") ? "LINEログインに失敗しました。もう一度お試しください。" : null,
  );
  const [loading, setLoading] = useState(false);

  function handleLineLogin() {
    window.location.href = `/api/auth/line/start?redirect=${encodeURIComponent(redirectTo)}`;
  }

  function callbackUrl(path = redirectTo) {
    return `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(path)}`;
  }

  async function handleGoogleLogin() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) setError(error.message);
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("メールアドレスまたはパスワードが違います");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("先にメールアドレスを入力してください");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl("/mypage/reset-password"),
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setResetSent(true);
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="font-display text-2xl font-semibold uppercase tracking-[0.2em] text-accent">
        MY PAGE
      </h1>
      <p className="mt-2 text-sm text-muted">
        ログインすると、保存した動画・推しパートナー・店舗ストックがいつでも見られます。
      </p>

      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full rounded-full border border-accent/60 bg-main/5 px-4 py-3 text-sm font-medium text-main transition hover:bg-main/10"
        >
          Googleでログイン
        </button>
        <button
          type="button"
          onClick={handleLineLogin}
          className="w-full rounded-full border border-main/20 bg-main/5 px-4 py-3 text-sm font-medium text-main transition hover:bg-main/10"
        >
          LINEでログイン
        </button>
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-tone-500">
        <div className="h-px flex-1 bg-main/10" />
        または
        <div className="h-px flex-1 bg-main/10" />
      </div>

      {mode === "link" ? (
        sent ? (
          <p className="rounded-lg border border-accent/30 bg-main/5 px-4 py-3 text-sm text-tone-300">
            {email} 宛にログイン用リンクを送りました。メールを確認してください。
          </p>
        ) : (
          <form onSubmit={handleEmailLogin} className="space-y-3">
            <input
              type="email"
              required
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-full border border-main/20 bg-main/5 px-4 py-3 text-[16px] text-main placeholder:text-tone-500"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gradient-to-r from-cta-gold-dark via-cta-gold to-cta-gold-light px-4 py-3 text-sm font-semibold text-on-cta-gold disabled:opacity-60"
            >
              {loading ? "送信中..." : "メールでログイン"}
            </button>
          </form>
        )
      ) : resetSent ? (
        <p className="rounded-lg border border-accent/30 bg-main/5 px-4 py-3 text-sm text-tone-300">
          {email} 宛にパスワード再設定用のリンクを送りました。メールを確認してください。
        </p>
      ) : (
        <form onSubmit={handlePasswordLogin} className="space-y-3">
          <input
            type="email"
            required
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-full border border-main/20 bg-main/5 px-4 py-3 text-[16px] text-main placeholder:text-tone-500"
          />
          <input
            type="password"
            required
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-full border border-main/20 bg-main/5 px-4 py-3 text-[16px] text-main placeholder:text-tone-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-to-r from-cta-gold-dark via-cta-gold to-cta-gold-light px-4 py-3 text-sm font-semibold text-on-cta-gold disabled:opacity-60"
          >
            {loading ? "ログイン中..." : "パスワードでログイン"}
          </button>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading}
            className="w-full text-center text-xs text-muted underline underline-offset-2"
          >
            パスワードをお忘れの方はこちら
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "link" ? "password" : "link");
          setError(null);
          setSent(false);
          setResetSent(false);
        }}
        className="mt-4 w-full text-center text-xs text-muted underline underline-offset-2"
      >
        {mode === "link" ? "パスワードでログインする" : "リンクでログインする"}
      </button>
    </div>
  );
}
