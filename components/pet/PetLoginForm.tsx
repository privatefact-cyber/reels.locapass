"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { checkEmailRegistered } from "@/app/pet/actions";
import { savePetAppleAuthorization } from "@/app/pet/appleActions";
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

  // ロカわんのiOSアプリの中でだけ「Appleでサインイン」を出す(アプリ標準の画面を呼ぶ)
  const [inApp, setInApp] = useState(false);
  // Androidアプリの中では、LINE・Googleのログインを、Chromeの安全な画面(Custom Tab)で行う
  const [inAndroid, setInAndroid] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  useEffect(() => {
    // 新規登録の「登録元=ロカわん」を記録するための目印(1時間)。LINE・Apple・メールのどの入口でも使える
    try {
      document.cookie = "lp_signup_src=pet; path=/; max-age=3600; samesite=lax";
    } catch {}
    const ua = navigator.userAgent;
    setInAndroid(ua.includes("LocaWanAndroid"));
    setInApp(ua.includes("LocaWanApp") && !ua.includes("LocaWanAndroid"));
  }, []);

  const callbackUrl = (path = redirectTo, app = false) => `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(path)}${app ? "&app=1" : ""}`;

  // Androidアプリでは、ログインのページを、Chromeの安全な画面(Custom Tab)で開く。
  // (アプリ内の画面では、Googleがログインを禁止し、LINEもQRコード画面になるため)。開けないときは、そのまま移動する。
  async function openExternal(url: string) {
    const browser = (window as unknown as { Capacitor?: { Plugins?: Record<string, { open?: (o: { url: string }) => Promise<void> }> } }).Capacitor?.Plugins?.Browser;
    if (browser?.open) await browser.open({ url });
    else window.location.href = url;
  }

  async function google() {
    setError(null);
    if (inAndroid) {
      const { data, error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(redirectTo, true), skipBrowserRedirect: true } });
      if (error || !data?.url) return setError(error?.message ?? "Googleでのログインを始められませんでした");
      return openExternal(data.url);
    }
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } });
    if (error) setError(error.message);
  }

  async function line(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!inAndroid) return; // iPhoneアプリ・ブラウザは、いままでどおり
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch(`/api/auth/line/start?redirect=${encodeURIComponent(redirectTo)}&ext=1`, { credentials: "include" });
      const json = (await res.json()) as { url?: string };
      if (!json.url) throw new Error("no_url");
      await openExternal(json.url);
    } catch {
      setError("LINEでのログインを始められませんでした。もう一度お試しください");
    }
  }

  async function apple() {
    if (busy) return;
    setAppleError(null);
    setBusy(true);
    try {
      const plugin = (window as unknown as { Capacitor?: { Plugins?: Record<string, { authorize: (o: object) => Promise<{ response: { identityToken: string; authorizationCode?: string; givenName: string | null; familyName: string | null } }> }> } }).Capacitor?.Plugins?.SignInWithApple;
      if (!plugin) throw new Error("apple_unavailable");
      // Appleには nonce をハッシュにして渡し、Supabaseには元の値を渡す(なりすまし防止の組)
      const raw = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      const hashed = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const res = await plugin.authorize({ clientId: "net.locapass.pet", redirectURI: "https://locapass.net/pet", scopes: "email name", nonce: hashed });
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: res.response.identityToken, nonce: raw });
      if (error) throw error;
      // アカウント削除のときにAppleとの連携を取り消せるよう、認可コードをサーバーに渡す(失敗してもログインは続ける)
      if (res.response.authorizationCode) void savePetAppleAuthorization(res.response.authorizationCode).catch(() => undefined);
      // 名前はAppleが初回しか渡さないので、あれば保存しておく
      const fullName = [res.response.familyName, res.response.givenName].filter(Boolean).join(" ");
      if (fullName) await supabase.auth.updateUser({ data: { full_name: fullName } });
      router.push(redirectTo);
      router.refresh();
    } catch (e) {
      // 本人が画面を閉じたとき(キャンセル)は何も出さない
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
      // 失敗の原因を後から調べられるよう、短い詳細を添える(個人情報は含まれない)
      if (!/1001|cancel/i.test(msg)) setAppleError(`Appleでのログインに失敗しました。もう一度お試しください${msg ? `(詳細: ${msg.slice(0, 140)})` : ""}`);
    } finally {
      setBusy(false);
    }
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
        {inApp && (
          <button
            type="button"
            onClick={apple}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-3.5 text-[15px] font-bold text-white active:scale-[0.99] disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M16.37 1.43c0 1.14-.46 2.22-1.2 3-.8.85-2.1 1.5-3.15 1.42-.13-1.1.4-2.25 1.1-2.98.8-.83 2.15-1.45 3.25-1.44zM20.5 17.1c-.55 1.27-.82 1.84-1.52 2.96-1 1.56-2.4 3.5-4.14 3.52-1.55.02-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.74-.02-3.07-1.77-4.07-3.33C-.2 15.9-.5 10.9 1.7 8.1c1.1-1.4 2.85-2.3 4.5-2.3 1.67 0 2.72 1.01 4.1 1.01 1.34 0 2.15-1.02 4.08-1.02 1.45 0 3 .8 4.1 2.15-3.6 1.97-3.02 7.1.02 9.16z" />
            </svg>
            Appleでサインイン
          </button>
        )}
        {inApp && appleError && <p className="text-sm font-bold text-[#D04848]">{appleError}</p>}
        <a
          href={`/api/auth/line/start?redirect=${encodeURIComponent(redirectTo)}`}
          onClick={line}
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
