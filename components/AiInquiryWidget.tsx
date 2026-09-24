"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, RotateCcw, ExternalLink, Mic } from "lucide-react";
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
  // 街の声: 回答の中で噂ネタ(shops.sns_whisper)を織り込んだ店舗名。あれば「ネットの噂レベル」の注記を出す。
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
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

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
export function AiInquiryWidget({ placement = "floating" }: { placement?: "floating" | "map" }) {
  const isMap = placement === "map";
  const { t, locale } = useLocale();
  const pathname = usePathname();
  const currentAreaSlug = guessCurrentAreaSlug(pathname);
  const [open, setOpen] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const askedLocationRef = useRef(false);
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
    setSpeechSupported(getSpeechRecognition() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
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
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
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
    if (open && !askedLocationRef.current) {
      askedLocationRef.current = true;
      // チャットを開いたタイミングで一度だけ位置情報の許可を試みる。取れなくても
      // (拒否・非対応・タイムアウト)エラーは飲み込み、従来通りcurrentAreaSlugベース
      // の案内にフォールバックする(ユーザー体験をブロックしない)。
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => {
            // 拒否・取得失敗時は何もしない(coordsはnullのまま)
          },
          { enableHighAccuracy: false, timeout: 4000, maximumAge: 5 * 60 * 1000 },
        );
      }
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

    recognitionRef.current?.stop();
    const sendMode = mode;
    appendMessage(sendMode, { role: "user", text });
    setInput("");
    setLoading(true);

    const selected = getAiSelectedContext();
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

  function handleReset() {
    resetSessionId(mode);
    setThreads((prev) => ({ ...prev, [mode]: [greetingFor(mode)] }));
    setEscalatedByMode((prev) => ({ ...prev, [mode]: false }));
    setInput("");
  }

  return (
    <div
      ref={rootRef}
      className={
        isMap
          ? "fixed right-3 top-[258px] z-[60] flex flex-col-reverse items-end"
          : "fixed bottom-20 right-4 z-[60] md:bottom-6"
      }
    >
      {open && (
        <div
          className={`flex w-80 max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-amber-500/20 bg-zinc-900/60 shadow-2xl shadow-black/40 backdrop-blur-xl backdrop-saturate-150 ${
            isMap ? "mt-3 h-[440px] max-h-[calc(100dvh-258px-80px)]" : "mb-3 h-[440px]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-gold">
                {isMachi ? t.ai.machiName : t.ai.assistantName}
              </span>
              {isMachi && <BetaBadge />}
              {/* 対応言語が一目で分かるよう表示する(国旗は国際問題になり得るため文字で示す) */}
              <span className="text-[10px] font-semibold leading-none text-white/50" title="日本語 / English / 中文 / العربية" aria-label="対応言語">
                {LOCALES.map((l) => LOCALE_SHORT_LABEL[l]).join(" · ")}
              </span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                aria-label={t.ai.resetTooltip}
                title={t.ai.resetTooltip}
                className="text-white/60 hover:text-white"
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.common.close}
                className="text-white/60 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {machiEnabled && (
            <div className="flex gap-1 border-b border-white/10 bg-black/20 p-1" role="tablist">
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
                    (mode === m ? "bg-white/10 text-gold" : "text-white/50 hover:text-white/80")
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
                      ? "border-white/20 bg-white/15 text-white"
                      : m.whisperShops
                        ? // 噂ネタ入りの回答は、ダークなすりガラス+ゴールドの差し色でトーンを変える。
                          "relative overflow-hidden border-gold/25 bg-black/50 text-neutral-200 shadow-inner shadow-black/60"
                        : "border-white/10 bg-white/5 text-neutral-200")
                  }
                >
                  {m.whisperShops && (
                    <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-gold-light via-gold to-gold-dark" />
                  )}
                  {m.text}
                </div>
                {m.whisperShops && <WhisperNote shops={m.whisperShops} />}
                {m.links && m.links.length > 0 && (
                  <div className="flex max-w-[85%] flex-col gap-1.5">
                    {m.links.map((link) => (
                      <Link
                        key={link.url}
                        href={toPath(link.url)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gold/30 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-gold hover:bg-white/10"
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
              <div className="rounded-xl border border-gold/20 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-neutral-300">
                {t.ai.escalatedNotice}
                <button
                  type="button"
                  onClick={handleReset}
                  className="ml-1 font-semibold text-gold underline underline-offset-2"
                >
                  {t.ai.startNewConversation}
                </button>
              </div>
            )}
            {!checkingAuth && !accessToken && messages.length > 0 && (
              <div className="rounded-xl border border-gold/20 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-neutral-300">
                {t.ai.loginPrompt}
                <a
                  href={`/mypage/login?redirect=${encodeURIComponent(
                    typeof window !== "undefined" ? window.location.pathname : "/",
                  )}`}
                  className="ml-1 font-semibold text-gold underline underline-offset-2"
                >
                  {t.ai.loginOrSignup}
                </a>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="flex gap-2 border-t border-white/10 bg-white/5 p-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              // 入力内容の最初の文字で向きを決める(アラビア語ページで日本語を打つと逆順に見える問題の対策)
              dir="auto"
              placeholder={t.ai.placeholder}
              disabled={loading}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[16px] text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none sm:text-xs"
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
                    : "border-white/15 bg-white/5 text-white/70 hover:text-white")
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
              className="flex items-center justify-center rounded-lg border border-amber-500/30 bg-gradient-to-tr from-gold-dark via-gold to-gold-light px-3 py-2 text-black disabled:opacity-50"
            >
              <Send size={14} />
            </button>
          </form>
          <p className="border-t border-white/5 bg-black/20 px-3 py-1.5 text-center text-[10px] leading-snug text-white/40">
            {t.ai.disclaimer}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.ai.triggerLabel}
        className={`flex items-center justify-center rounded-full border border-white/20 bg-zinc-900/60 text-white shadow-lg shadow-black/40 backdrop-blur-xl backdrop-saturate-150 transition hover:bg-zinc-800/70 ${
          isMap ? "h-11 w-11" : "h-14 w-14"
        }`}
      >
        <MessageCircle size={isMap ? 18 : 22} />
      </button>
    </div>
  );
}

function BetaBadge() {
  return (
    <span className="rounded border border-gold/40 px-1 py-px text-[9px] font-bold leading-none tracking-wider text-gold/80">
      β
    </span>
  );
}

/** 街の声で噂ネタを織り込んだ回答の下に出す注記(噂であることを必ず明示する)。 */
function WhisperNote({ shops }: { shops: string[] }) {
  const { t } = useLocale();
  return (
    <p className="flex max-w-[85%] flex-wrap items-baseline gap-x-1.5 px-1 text-[10px] text-white/40">
      <span aria-hidden>🕶️</span>
      <span className="font-bold text-gold/80">{t.ai.whisperTitle}</span>
      <bdi>{shops.join(" / ")}</bdi>
      <span>({t.ai.whisperNote})</span>
    </p>
  );
}
