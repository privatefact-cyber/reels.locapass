"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { checkEmailRegistered } from "@/app/pet/actions";
import { PetCard, petButton, petInput } from "./ui";

/**
 * ロカわんのログイン・新規登録。仕組みはLOCAPASSと同じ(同じアカウント)。
 * - LINE / Google / メールのリンク(未登録ならそのまま新規登録) / パスワード
 * - メールのときは先に、そのアドレスがLOCAPASSに登録済みかを確かめて案内する
 */
export function PetLoginForm({ redirectTo, lineError }: { redirectTo: string; lineError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "password">("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(lineError ? "LINEでのログインに失敗しました。もう一度お試しください" : null);
  const [result, setResult] = useState<{ registered: boolean } | null>(null);

  const callbackUrl = (path = redirectTo) => `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(path)}`;

  async function google() {
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } });
    if (error) setError(error.message);
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const check = await checkEmailRegistered(email);
    if (!check.ok) {
      setBusy(false);
      return setError(check.error);
    }
    // 登録済みならログイン用、未登録なら新規登録用のリンクになる(どちらも同じメール)
    const { error } = await createClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callbackUrl() } });
    setBusy(false);
    if (error) return setError("メールを送れませんでした。少し時間をおいてお試しください");
    setResult({ registered: check.registered });
  }

  async function passwordLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError("メールアドレスまたはパスワードが違います");
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <PetCard className="space-y-3">
        <a
          href={`/api/auth/line/start?redirect=${encodeURIComponent(redirectTo)}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] px-5 py-3.5 text-[15px] font-extrabold text-white shadow-[0_4px_0_#04A044] active:translate-y-[2px]"
        >
          LINEで登録・ログイン
        </a>
        <button type="button" onClick={google} className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-[#F1E1CF] bg-white px-5 py-3 text-[15px] font-bold text-[#4A3426] active:scale-[0.99]">
          <span className="text-lg font-extrabold text-[#4285F4]">G</span>
          Googleで登録・ログイン
        </button>
      </PetCard>

      <div className="flex items-center gap-3 px-2 text-xs text-[#B39C8C]">
        <div className="h-px flex-1 bg-[#F1E1CF]" />
        またはメールで
        <div className="h-px flex-1 bg-[#F1E1CF]" />
      </div>

      <PetCard className="space-y-3">
        {result ? (
          <div className="space-y-2 text-sm">
            {result.registered ? (
              <p className="rounded-2xl bg-[#FFF8E1] px-3 py-3 font-bold text-[#8A6A00]">
                🐾 このメールアドレスは、LOCAPASSに登録済みです。
                <span className="mt-1 block text-xs font-normal">LOCAPASSと同じアカウントで、ロカわんをそのまま使えます。ログイン用のリンクを送りました。</span>
              </p>
            ) : (
              <p className="rounded-2xl bg-[#E5F7F0] px-3 py-3 font-bold text-[#22806A]">
                🎉 新しく登録します。
                <span className="mt-1 block text-xs font-normal">確認用のリンクを送りました。同じアカウントでLOCAPASSも使えます。</span>
              </p>
            )}
            <p className="flex items-center gap-1 text-xs text-[#7A6050]">
              <Mail size={14} />
              {email} のメールを開いて、リンクを押してください。
            </p>
            <button type="button" onClick={() => setResult(null)} className={petButton.ghost}>
              別のアドレスで送り直す
            </button>
          </div>
        ) : mode === "link" ? (
          <form onSubmit={sendLink} className="space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className={petInput} autoComplete="email" />
            {error && <p className="text-sm font-bold text-[#D04848]">{error}</p>}
            <button type="submit" disabled={busy} className={`${petButton.primary} w-full`}>
              {busy && <Loader2 size={18} className="animate-spin" />}
              メールで登録・ログイン
            </button>
            <p className="px-1 text-[11px] text-[#B39C8C]">パスワードは不要です。届いたメールのリンクを押すと、ログイン(はじめての方は登録)できます。</p>
          </form>
        ) : (
          <form onSubmit={passwordLogin} className="space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className={petInput} autoComplete="email" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" className={petInput} autoComplete="current-password" />
            {error && <p className="text-sm font-bold text-[#D04848]">{error}</p>}
            <button type="submit" disabled={busy} className={`${petButton.primary} w-full`}>
              {busy && <Loader2 size={18} className="animate-spin" />}
              パスワードでログイン
            </button>
          </form>
        )}
        {!result && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === "link" ? "password" : "link");
              setError(null);
            }}
            className="w-full text-center text-xs font-bold text-[#9C8273] underline underline-offset-2"
          >
            {mode === "link" ? "パスワードでログインする" : "メールのリンクでログイン・登録する"}
          </button>
        )}
      </PetCard>

      <p className="px-2 text-center text-[11px] leading-relaxed text-[#B39C8C]">
        ロカわんはLOCAPASS(ロカパス)のアカウントで使えます。
        <br />
        登録すると、
        <a href="/terms" className="underline">
          利用規約
        </a>
        と
        <a href="/privacy" className="underline">
          プライバシーポリシー
        </a>
        に同意したものとみなします。
      </p>
    </div>
  );
}
