"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, RotateCcw, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AvatarPeek } from "@/components/AvatarPeek";
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
const SESSION_STORAGE_KEY = "locapass_ai_inquiry_session_id";

type ChatLink = { title: string; url: string };

type ChatMessage = {
  role: "user" | "ai";
  text: string;
  links?: ChatLink[];
};

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

function newSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = newSessionId();
      localStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return newSessionId();
  }
}

function resetSessionId(): string {
  const id = newSessionId();
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, id);
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
  const { t } = useLocale();
  const pathname = usePathname();
  const currentAreaSlug = guessCurrentAreaSlug(pathname);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [greeted, setGreeted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [escalated, setEscalated] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (open && !greeted) {
      setGreeted(true);
      setMessages([
        {
          role: "ai",
          text: t.ai.greeting,
        },
      ]);
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
  }, [open, greeted]);

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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);

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
          session_id: getSessionId(),
          message: text,
          // 実機の位置情報(GPS)が取れていればそれを最優先で送る。取れていなければ
          // 従来通り閲覧中のエリアポータル(URL)を送る。どちらも無ければ何も送らず、
          // バックエンド側で「行きたいエリアはありますか?」と聞く従来動作にフォールバック。
          ...(coords ? { user_lat: coords.lat, user_lng: coords.lng } : {}),
          ...(currentAreaSlug ? { current_area_slug: currentAreaSlug } : {}),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: data?.reply ?? t.ai.genericError,
          links: Array.isArray(data?.links) ? data.links : undefined,
        },
      ]);
      setEscalated(Boolean(data?.escalated));
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: t.ai.sendError },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    resetSessionId();
    setMessages([
      {
        role: "ai",
        text: t.ai.greeting,
      },
    ]);
    setEscalated(false);
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
            <span className="text-xs font-semibold tracking-wide text-gold">
              {t.ai.assistantName}
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

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "space-y-1.5"}>
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-xl border px-3 py-2 text-xs leading-relaxed " +
                    (m.role === "user"
                      ? "border-white/20 bg-white/15 text-white"
                      : "border-white/10 bg-white/5 text-neutral-200")
                  }
                >
                  {m.text}
                </div>
                {m.links && m.links.length > 0 && (
                  <div className="flex max-w-[85%] flex-col gap-1.5">
                    {m.links.map((link) => (
                      <AvatarPeek key={link.url} href={toPath(link.url)} label={link.title} className="block w-full">
                        <span className="flex w-full items-center justify-between gap-2 rounded-xl border border-gold/30 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-gold hover:bg-white/10">
                          {link.title}
                          <ExternalLink size={12} className="shrink-0" />
                        </span>
                      </AvatarPeek>
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
              placeholder={t.ai.placeholder}
              disabled={loading}
              className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label={t.ai.send}
              className="flex items-center justify-center rounded-lg border border-amber-500/30 bg-gradient-to-tr from-gold-dark via-gold to-gold-light px-3 py-2 text-black disabled:opacity-50"
            >
              <Send size={14} />
            </button>
          </form>
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
