"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Send, RotateCcw, ExternalLink, Mic, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAiSelectedContext } from "@/lib/aiContext";
import { LOCALES, LOCALE_SHORT_LABEL, type Locale } from "@/lib/i18n/locale";
import { useLocale } from "@/components/i18n/LocaleProvider";

// app/配下の静的トップレベルルート一覧。/[prefecture]は実体がlocapass_portals.slug
// (例: "mito", "oarai")を受け取る動的ルートだが、Next.jsは静的ルートを優先するため、
// これらのパスはエリアポータルとして扱わない(現在地ヒントの誤検出を避ける)。
const RESERVED_TOP_SEGMENTS = new Set([
  "admin",
  "api",
  "auth",
  "c",
  "cast",
  "dashboard",
  "events",
  "gate",
  "inquiries",
  "login",
  "map",
  "mypage",
  "notifications",
  "s",
  "shops",
  "staff",
]);

// 現在のパスから、今見ているエリアポータル(locapass_portals.slug)らしき値を推測する。
// 該当しなければnull(チャットバックエンドはこれを「エリア不明」として扱う)。
function guessCurrentAreaSlug(pathname: string | null): string | null {
  if (!pathname) return null;
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first || RESERVED_TOP_SEGMENTS.has(first)) return null;
  return first;
}

const CHAT_ENDPOINT =
  "https://ezhbjfkbfjgijdcvmzdi.supabase.co/functions/v1/wp-inquiry-chat";
const SITE_DOMAIN = "locapass.net";
// このキーはサイト識別用の公開キー相当(publishable keyと同じ扱い)。
// 秘匿すべき認証情報ではなく、サーバー側でこのサイトのナレッジベース範囲を
// 特定するためだけに使う。
const SITE_SECRET = "x4m1GU0B5kSoBW3JkKAFReBwLp3pTFpDz5NEHNWy";
// 「街の声ベータ版」は通常のコンシェルジュと会話を混ぜないよう、別のセッションIDを使う。
const SESSION_STORAGE_KEYS = {
  concierge: "locapass_ai_inquiry_session_id",
  machi: "locapass_ai_machi_no_koe_session_id",
} as const;

type Mode = keyof typeof SESSION_STORAGE_KEYS;

type ChatLink = { title: string; url: string };

type ChatMessage = {
  role: "user" | "ai";
  text: string;
  links?: ChatLink[];
  // 街の声: 回答の中で噂ネタ(shops.sns_whisper)を織り込んだ店舗名。あれば吹き出しをゴールドの縁取りにする
  // (噂である旨の注記は、チャット下部の「AIによる回答です…」に一本化した)。
  whisperShops?: string[];
};

// 音声入力(Web Speech API)の認識言語。サイトの表示言語に合わせる。
const SPEECH_LANG: Record<Locale, string> = { ja: "ja-JP", en: "en-US", zh: "zh-CN", ar: "ar-SA" };

// Web Speech API は標準の型定義が無い(Chrome/Safariは webkit 接頭辞)ので、使う分だけ定義する。
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

/**
 * iPhone/iPad(Safari)は Web Speech API の実装が不安定で、認識が止まらず画面ごと固まることがあった。
 * iOSではブラウザの音声認識を使わず、キーボードの音声入力(マイク)に任せる。
 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** 何も聞き取れないまま、この時間が経ったら自動でマイクを止める(止まらない事故の保険)。 */
const MIC_SILENCE_TIMEOUT_MS = 8000;

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// n8n側から返るlinksは絶対URL(https://reels.locapass.net/shops/...)なので、AvatarPeekの
// iframeプレビュー/router.pushにはパス部分だけを渡す(絶対URLのままだと
// クロスオリジン扱いになりrouter.pushが効かず、ローカル開発時は本番サイトを
// 埋め込んでしまう)。
function toPath(url: string): string {
  try {
    return new URL(url, "https://reels.locapass.net").pathname;
  } catch {
    return url;
  }
}

function newSessionId(mode: Mode): string {
  const prefix = mode === "machi" ? "machi" : "sess";
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId(mode: Mode): string {
  try {
    let id = localStorage.getItem(SESSION_STORAGE_KEYS[mode]);
    if (!id) {
      id = newSessionId(mode);
      localStorage.setItem(SESSION_STORAGE_KEYS[mode], id);
    }
    return id;
  } catch {
    return newSessionId(mode);
  }
}

function resetSessionId(mode: Mode): string {
  const id = newSessionId(mode);
  try {
    localStorage.setItem(SESSION_STORAGE_KEYS[mode], id);
  } catch {
    // localStorageが使えない環境ではメモリ上のIDだけで継続(次回リロードで再度新規化される)
  }
  return id;
}

/**
 * placement:
 * - "floating" … 通常ページ。右下に浮かせ、チャットは上に開く。
 * - "map"      … マップページ。右下は店舗カードのカルーセルと重なるので、地図右上の
 *                ズーム/現在地ボタンの下に置き、チャットは下に開く(高さもカードに被らない範囲に抑える)。
 */
/** 配色テーマ(値は app/globals.css の [data-theme])。通常はサイト全体のテーマに従う。 */
export type AiWidgetTheme = "default" | "christmas" | "beauty" | "nature";

export function AiInquiryWidget({
  placement = "floating",
  theme,
}: {
  placement?: "floating" | "map";
  /** このウィジェットだけ配色を変えたいときに指定。未指定ならサイト全体のテーマ(12/1〜12/25はクリスマス)に従う。 */
  theme?: AiWidgetTheme;
}) {
  const isMap = placement === "map";
  const { t, locale } = useLocale();
  const pathname = usePathname();
  const currentAreaSlug = guessCurrentAreaSlug(pathname);
  const [open, setOpen] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [iosDictation, setIosDictation] = useState(false);
  const [listening, setListening] = useState(false);
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("concierge");
  // 管理画面の「街の声ベータ版」スイッチ(platform_settings.locapass_machi_no_koe_beta_enabled)。オフならタブごと出さない。
  const [machiEnabled, setMachiEnabled] = useState(false);
  const [threads, setThreads] = useState<Record<Mode, ChatMessage[]>>({ concierge: [], machi: [] });
  const [escalatedByMode, setEscalatedByMode] = useState<Record<Mode, boolean>>({
    concierge: false,
    machi: false,
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  // 位置情報(GPS)。近いお店から提案するために使う。iPhoneのSafariは「ボタンを押したその操作の中」で
  // 頼まないと許可のアラートを出さないことがあるので、チャットボタンの onClick から直接呼ぶ(マップと同じ)。
  // 取れなくても(拒否・非対応・タイムアウト)何もせず、位置情報なしの案内にフォールバックする。
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationRequestRef = useRef<Promise<void> | null>(null);

  function requestLocation() {
    if (locationRequestRef.current || typeof navigator === "undefined" || !navigator.geolocation) return;
    locationRequestRef.current = new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
      );
    });
  }

  /** 許可アラートへの返事や測位が送信に少しだけ遅れても、最初の質問に位置情報が乗るよう最大 ms 待つ。 */
  async function waitForLocation(ms: number) {
    const pending = locationRequestRef.current;
    if (!pending || coordsRef.current) return;
    await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, ms))]);
  }
  const listRef = useRef<HTMLDivElement>(null);
  const messages = threads[mode];
  const escalated = escalatedByMode[mode];
  const isMachi = mode === "machi";

  function greetingFor(m: Mode): ChatMessage {
    return { role: "ai", text: m === "machi" ? t.ai.machiGreeting : t.ai.greeting };
  }

  function appendMessage(m: Mode, msg: ChatMessage) {
    setThreads((prev) => ({ ...prev, [m]: [...prev[m], msg] }));
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
      setCheckingAuth(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // SSRとの不一致を避けるため、対応可否はマウント後に判定する(非対応ブラウザではマイクを出さない)。
  useEffect(() => {
    const ios = isIOS();
    setIosDictation(ios);
    setSpeechSupported(ios || getSpeechRecognition() !== null);
    return () => stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // マイクを必ず止める。ブラウザが終了を知らせてこない場合もあるので、画面の状態はここで即座に戻す。
  function stopListening() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try {
        if (recognition.abort) recognition.abort();
        else recognition.stop();
      } catch {
        // 既に止まっている
      }
    }
    setListening(false);
  }

  function armSilenceTimer() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(stopListening, MIC_SILENCE_TIMEOUT_MS);
  }

  function micErrorMessage(error: string | undefined): string {
    if (error === "not-allowed" || error === "service-not-allowed") return t.ai.micDenied;
    if (error === "no-speech") return t.ai.micNoSpeech;
    return t.ai.micUnavailable;
  }

  function toggleListening() {
    if (listening) {
      stopListening();
      return;
    }
    setMicMessage(null);
    if (iosDictation) {
      // iOS: 入力欄にフォーカスしてキーボードを出し、キーボードのマイクで話してもらう。
      inputRef.current?.focus();
      setMicMessage(t.ai.micIosHint);
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = SPEECH_LANG[locale];
    recognition.interimResults = true;
    recognition.continuous = false;
    // 話し始める前に入力済みの文があれば、その後ろに続ける。
    const base = input.trim() ? `${input.trim()} ` : "";
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join("");
      setInput(base + transcript);
      armSilenceTimer();
    };
    recognition.onend = () => stopListening();
    recognition.onerror = (e) => {
      setMicMessage(micErrorMessage(e?.error));
      stopListening();
    };
    recognitionRef.current = recognition;
    setListening(true);
    armSilenceTimer();
    try {
      recognition.start();
    } catch {
      setMicMessage(t.ai.micUnavailable);
      stopListening();
    }
  }

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("platform_settings")
      .select("locapass_machi_no_koe_beta_enabled")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        // locapass用のスイッチ(LUXELAの machi_no_koe_beta_enabled とは別に切り替える)。
        const enabled = Boolean(data?.locapass_machi_no_koe_beta_enabled);
        setMachiEnabled(enabled);
        if (!enabled) setMode("concierge");
      });
  }, []);

  // 開いているタブの会話がまだ空なら挨拶を入れる(タブごとに1回)。
  useEffect(() => {
    if (open && threads[mode].length === 0) {
      setThreads((prev) => ({ ...prev, [mode]: [greetingFor(mode)] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // 新しい発言が来たらスクロールする。AIの返事は「本文の頭」が見える位置で止める
  // (一番下まで送ると、長い返事の本文が上に隠れて店舗ボタンしか見えず「返事が来ない」ように見えるため)。
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const last = messages[messages.length - 1];
    const lastEl = list.querySelector<HTMLElement>("[data-last-message]");
    if (last?.role === "ai" && lastEl && messages.length > 1) {
      list.scrollTo({ top: Math.max(0, lastEl.offsetTop - list.offsetTop - 8), behavior: "smooth" });
    } else {
      list.scrollTo({ top: list.scrollHeight });
    }
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    stopListening();
    setMicMessage(null);
    const sendMode = mode;
    appendMessage(sendMode, { role: "user", text });
    setInput("");
    setLoading(true);

    const selected = getAiSelectedContext();
    await waitForLocation(3000);
    const coords = coordsRef.current;
    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          domain: SITE_DOMAIN,
          secret_key: SITE_SECRET,
          session_id: getSessionId(sendMode),
          message: text,
          ...(sendMode === "machi" ? { mode: "machi_no_koe" } : {}),
          ...(selected.keyword ? { selected_keyword: selected.keyword } : {}),
          ...(selected.genres.length > 0 ? { selected_genres: selected.genres } : {}),
          // 実機の位置情報(GPS)が取れていればそれを最優先で送る。取れていなければ
          // 従来通り閲覧中のエリアポータル(URL)を送る。どちらも無ければ何も送らず、
          // バックエンド側で「行きたいエリアはありますか?」と聞く従来動作にフォールバック。
          ...(coords ? { user_lat: coords.lat, user_lng: coords.lng } : {}),
          ...(currentAreaSlug ? { current_area_slug: currentAreaSlug } : {}),
        }),
      });
      const data = await res.json();
      appendMessage(sendMode, {
        role: "ai",
        text: data?.reply ?? t.ai.genericError,
        links: Array.isArray(data?.links) ? data.links : undefined,
        whisperShops:
          Array.isArray(data?.whisper_shops) && data.whisper_shops.length > 0 ? data.whisper_shops : undefined,
      });
      setEscalatedByMode((prev) => ({ ...prev, [sendMode]: Boolean(data?.escalated) }));
    } catch {
      appendMessage(sendMode, { role: "ai", text: t.ai.sendError });
    } finally {
      setLoading(false);
    }
  }

  // 計測: 返事に出た店舗ボタンの押下(街の声と通常コンシェルジュの比較用。失敗しても何もしない)。
  function recordLinkClick(shopPath: string) {
    const supabase = createClient();
    void supabase
      .from("concierge_link_clicks")
      .insert({
        site: "locapass",
        mode: isMachi ? "machi" : "concierge",
        session_id: getSessionId(mode),
        shop_path: shopPath.slice(0, 300),
      })
      .then(() => undefined);
  }

  function handleReset() {
    resetSessionId(mode);
    setThreads((prev) => ({ ...prev, [mode]: [greetingFor(mode)] }));
    setEscalatedByMode((prev) => ({ ...prev, [mode]: false }));
    setInput("");
  }

  return (
    <div
      ref={rootRef}
      data-theme={theme}
      className={
        isMap
          ? "fixed right-3 top-[258px] z-[60] flex flex-col-reverse items-end"
          : "fixed bottom-20 right-4 z-[60] md:bottom-6"
      }
    >
      {open && (
        <div
          className={`flex w-80 max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-line/20 bg-panel-900/60 shadow-2xl shadow-black/40 backdrop-blur-xl backdrop-saturate-150 ${
            isMap ? "mt-3 h-[440px] max-h-[calc(100dvh-258px-80px)]" : "mb-3 h-[440px]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-main/10 bg-main/5 px-4 py-3">
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-accent">
                {isMachi ? t.ai.machiName : t.ai.assistantName}
              </span>
              {isMachi && <BetaBadge />}
              {/* 対応言語が一目で分かるよう表示する(国旗は国際問題になり得るため文字で示す) */}
              <span className="text-[10px] font-semibold leading-none text-main/50" title="日本語 / English / 中文 / العربية" aria-label="対応言語">
                {LOCALES.map((l) => LOCALE_SHORT_LABEL[l]).join(" · ")}
              </span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                aria-label={t.ai.resetTooltip}
                title={t.ai.resetTooltip}
                className="text-main/60 hover:text-main"
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.common.close}
                className="text-main/60 hover:text-main"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {machiEnabled && (
            <div className="flex gap-1 border-b border-main/10 bg-page/20 p-1" role="tablist">
              {(["concierge", "machi"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  disabled={loading}
                  onClick={() => setMode(m)}
                  className={
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 " +
                    (mode === m ? "bg-main/10 text-accent" : "text-main/50 hover:text-main/80")
                  }
                >
                  {m === "machi" ? t.ai.machiTab : t.ai.conciergeTab}
                  {m === "machi" && <BetaBadge />}
                </button>
              ))}
            </div>
          )}

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                data-last-message={i === messages.length - 1 ? "" : undefined}
                className={m.role === "user" ? "flex justify-end" : "space-y-1.5"}
              >
                <div
                  dir="auto"
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-xl border px-3 py-2 text-xs leading-relaxed " +
                    (m.role === "user"
                      ? "border-main/20 bg-main/15 text-main"
                      : m.whisperShops
                        ? // 噂ネタ入りの回答は、ダークなすりガラス+ゴールドの差し色でトーンを変える。
                          "relative overflow-hidden border-accent/25 bg-page/50 text-tone-200 shadow-inner shadow-black/60"
                        : "border-main/10 bg-main/5 text-tone-200")
                  }
                >
                  {m.whisperShops && (
                    <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-accent-light via-accent to-accent-dark" />
                  )}
                  {m.text}
                </div>
                {m.links && m.links.length > 0 && (
                  <div className="flex max-w-[85%] flex-col gap-1.5">
                    {m.links.map((link) => (
                      <Link
                        key={link.url}
                        href={toPath(link.url)}
                        onClick={() => recordLinkClick(toPath(link.url))}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-accent/30 bg-main/5 px-3 py-2 text-left text-xs font-semibold text-accent hover:bg-main/10"
                      >
                        {link.title}
                        <ExternalLink size={12} className="shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {escalated && (
              <div className="rounded-xl border border-accent/20 bg-main/5 px-3 py-2 text-[11px] leading-relaxed text-tone-300">
                {t.ai.escalatedNotice}
                <button
                  type="button"
                  onClick={handleReset}
                  className="ml-1 font-semibold text-accent underline underline-offset-2"
                >
                  {t.ai.startNewConversation}
                </button>
              </div>
            )}
            {!checkingAuth && !accessToken && messages.length > 0 && (
              <div className="rounded-xl border border-accent/20 bg-main/5 px-3 py-2 text-[11px] leading-relaxed text-tone-300">
                {t.ai.loginPrompt}
                <a
                  href={`/mypage/login?redirect=${encodeURIComponent(
                    typeof window !== "undefined" ? window.location.pathname : "/",
                  )}`}
                  className="ml-1 font-semibold text-accent underline underline-offset-2"
                >
                  {t.ai.loginOrSignup}
                </a>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="flex gap-2 border-t border-main/10 bg-main/5 p-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              // 入力内容の最初の文字で向きを決める(アラビア語ページで日本語を打つと逆順に見える問題の対策)
              dir="auto"
              placeholder={t.ai.placeholder}
              disabled={loading}
              className="min-w-0 flex-1 rounded-lg border border-main/15 bg-main/5 px-3 py-2 text-[16px] text-main placeholder:text-main/40 focus:border-main/40 focus:outline-none sm:text-xs"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={loading}
                aria-label={listening ? t.ai.micStop : t.ai.micStart}
                title={listening ? t.ai.micStop : t.ai.micStart}
                aria-pressed={listening}
                className={
                  "relative flex items-center justify-center rounded-lg border px-3 py-2 transition disabled:opacity-50 " +
                  (listening
                    ? "border-red-400/60 bg-red-500/20 text-red-300"
                    : "border-main/15 bg-main/5 text-main/70 hover:text-main")
                }
              >
                {listening && <span className="absolute inset-0 animate-ping rounded-lg border border-red-400/40" />}
                <Mic size={14} />
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              aria-label={t.ai.send}
              className="flex items-center justify-center rounded-lg border border-line/30 bg-gradient-to-tr from-cta-gold-dark via-cta-gold to-cta-gold-light px-3 py-2 text-on-cta-gold disabled:opacity-50"
            >
              <Send size={14} />
            </button>
          </form>
          {micMessage && (
            <p role="status" className="bg-main/5 px-3 pb-1.5 text-[11px] leading-snug text-hl-200/80">
              {micMessage}
            </p>
          )}
          <p className="border-t border-main/5 bg-page/20 px-3 py-1.5 text-center text-[10px] leading-snug text-main/40">
            {t.ai.disclaimer}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (!open) requestLocation();
          setOpen((v) => !v);
        }}
        aria-label={t.ai.triggerLabel}
        // ✨だけのボタンに、ゴールドの光彩がゆっくり呼吸する演出(視差効果を減らす設定の端末では止める)。
        className={`flex items-center justify-center rounded-full border border-line/20 bg-page/60 text-accent backdrop-blur-md backdrop-saturate-150 transition hover:border-line/40 hover:bg-page/70 motion-safe:animate-ai-glow ${
          isMap ? "h-11 w-11" : "h-14 w-14"
        }`}
      >
        <Sparkles size={isMap ? 18 : 22} strokeWidth={1.75} className="motion-safe:animate-ai-glow-icon" />
      </button>
    </div>
  );
}

function BetaBadge() {
  return (
    <span className="rounded border border-accent/40 px-1 py-px text-[9px] font-bold leading-none tracking-wider text-accent/80">
      β
    </span>
  );
}
