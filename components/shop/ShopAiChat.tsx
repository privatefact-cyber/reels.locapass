"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

/** 店舗AI質問(有料オプション)の、チャットの中身(会話の保持・音声入力・読み上げ・画面を動かす動き)。文言はここだけで完結させる。日本語以外は英語。 */
export const LABELS = {
  ja: {
    title: "この店舗について質問",
    note: "AIがこの店舗の登録情報だけで答えます(ネットの情報は使いません)",
    placeholder: "質問する",
    dockPlaceholder: "このお店のことを聞いてください",
    close: "閉じる",
    send: "送信",
    voice: "音声で質問",
    listening: "聞いています…(話し終えると、そのまま送信します)",
    reserveOpening: "予約・ご連絡の画面を開きます…",
    gotoOpening: "該当の画面へ移動します…",
    callOpening: "お電話の画面を開きます…",
    openNow: "今すぐ開く",
    cancel: "やめる",
    thinking: "考えています…",
    aiBadge: "AI",
    conciergeName: "AIコンシェルジュ",
    welcome: "いらっしゃいませ。このお店のことなら、何でも聞いてください。",
    speak: "声で読み上げ",
    back: "AIに戻る",
    choicesTitle: "こちらはいかがですか?",
    chips: ["営業時間は?", "料金は?", "今日のFACESは?"],
    choiceLabels: { cast: "FACES", today: "本日のFACES", price: "料金", access: "アクセス・地図", reels: "リール", call: "電話する", contact: "予約・ご連絡" } as Record<string, string>,
    errors: {
      "visitor-limit": "本日の質問回数の上限に達しました。明日またお試しください。",
      "shop-limit": "この店舗への質問が集中しています。しばらくしてからお試しください。",
      busy: "ただいま混み合っています。少し待ってからお試しください。",
      failed: "答えを作れませんでした。もう一度お試しください。",
      "too-long": "質問は200文字以内でお願いします。",
    } as Record<string, string>,
  },
  en: {
    title: "Ask about this venue",
    note: "Answers use only this venue's registered information (no web search)",
    placeholder: "Ask a question",
    dockPlaceholder: "Ask about this venue",
    close: "Close",
    send: "Send",
    voice: "Ask by voice",
    listening: "Listening… (it sends when you stop talking)",
    reserveOpening: "Opening the contact screen…",
    gotoOpening: "Taking you there…",
    callOpening: "Opening the phone screen…",
    openNow: "Open now",
    cancel: "Cancel",
    thinking: "Thinking…",
    aiBadge: "AI",
    conciergeName: "AI Concierge",
    welcome: "Welcome! Ask me anything about this venue.",
    speak: "Read aloud",
    back: "Back to AI",
    choicesTitle: "How about one of these?",
    chips: ["Opening hours?", "Prices?", "Who are the FACES today?"],
    choiceLabels: { cast: "FACES", today: "FACES today", price: "Prices", access: "Access & map", reels: "Reels", call: "Call", contact: "Reserve / Contact" } as Record<string, string>,
    errors: {
      "visitor-limit": "You've reached today's question limit. Please try again tomorrow.",
      "shop-limit": "This venue is receiving many questions. Please try again later.",
      busy: "We're busy right now. Please try again shortly.",
      failed: "Couldn't generate an answer. Please try again.",
      "too-long": "Please keep your question under 200 characters.",
    } as Record<string, string>,
  },
};

export type AiMessage = { id: number; role: "user" | "ai"; text: string };
/** 画面を動かす先。店舗ページの場所(path+hash)、連絡の画面(contact)、電話や外部ページ(href)。予約の確定はお客様が行う。 */
export type AiNav = { kind: "reserve" | "goto" | "call"; path?: string; hash?: string; contact?: boolean; href?: string };
export type AiChoice = { key: string; nav: AiNav };

const SPEECH_LANG: Record<string, string> = { ja: "ja-JP", en: "en-US", zh: "zh-CN", ar: "ar-SA" };
const stripLocale = (p: string) => p.replace(/^\/(en|zh|ar)(?=\/|$)/, "");
const returnKey = (shopId: string) => `shopAiReturn:${shopId}`;
const chatKey = (shopId: string) => `shopAi:${shopId}`;

/**
 * 声の出力(読み上げ)の差し替え口。いまはブラウザの読み上げ(無料)。
 * 将来、音声合成のAPI(自然な声)に替えるときは、この speak / cancel だけを差し替える。
 */
export const voiceOutput = {
  supported: () => typeof window !== "undefined" && "speechSynthesis" in window,
  speak(text: string, lang: string, hooks?: { onStart?: () => void; onEnd?: () => void }) {
    if (!this.supported()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.onstart = () => hooks?.onStart?.();
    u.onend = () => hooks?.onEnd?.();
    u.onerror = () => hooks?.onEnd?.();
    window.speechSynthesis.speak(u);
  },
  cancel() {
    if (this.supported()) window.speechSynthesis.cancel();
  },
};

/** 画面を動かす。同じ店舗ページにいるときは、その場でスクロール/連絡の画面を開く。別のページからは、店舗ページの該当の場所へ移動する。 */
export function runNav(nav: AiNav) {
  if (nav.href) {
    window.location.href = nav.href;
    return;
  }
  const path = nav.path ?? "";
  if (stripLocale(window.location.pathname) === path) {
    if (nav.contact) window.dispatchEvent(new Event("shop-contact-open"));
    else if (nav.hash) document.getElementById(nav.hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const prefix = /^\/(en|zh|ar)(?=\/|$)/.exec(window.location.pathname)?.[0] ?? "";
  window.location.href = `${prefix}${path}${nav.contact ? "?contact=1" : nav.hash ? `#${nav.hash}` : ""}`;
}

export function consumeAiReturn(shopId: string): boolean {
  try {
    const v = sessionStorage.getItem(returnKey(shopId)) === "1";
    return v;
  } catch {
    return false;
  }
}
export function clearAiReturn(shopId: string) {
  try {
    sessionStorage.removeItem(returnKey(shopId));
  } catch {
    // 使えない環境では何もしない
  }
}

export function useShopAi(shopId: string, opts?: { onLeave?: () => void }) {
  const { locale } = useLocale();
  const l = locale === "ja" ? LABELS.ja : LABELS.en;
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<AiNav | null>(null);
  const [choices, setChoices] = useState<AiChoice[]>([]);
  const [speakOn, setSpeakOnState] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const onLeaveRef = useRef(opts?.onLeave);
  onLeaveRef.current = opts?.onLeave;
  const speechLang = SPEECH_LANG[locale] ?? "en-US";

  // 会話は、このタブの間だけ覚えておく(店舗ページへ移動して戻ってきても、続きから話せる)。
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(chatKey(shopId));
      if (raw) setMessages((JSON.parse(raw) as AiMessage[]).slice(-30));
      setSpeakOnState(localStorage.getItem("shopAiSpeak") === "1");
    } catch {
      // 使えない環境では、覚えずに続ける
    }
  }, [shopId]);
  useEffect(() => {
    try {
      sessionStorage.setItem(chatKey(shopId), JSON.stringify(messages.slice(-30)));
    } catch {
      // 使えない環境では、覚えずに続ける
    }
  }, [shopId, messages]);

  const setSpeakOn = useCallback((on: boolean) => {
    setSpeakOnState(on);
    try {
      localStorage.setItem("shopAiSpeak", on ? "1" : "0");
    } catch {
      // 使えない環境では、覚えずに続ける
    }
    if (!on) {
      voiceOutput.cancel();
      setSpeaking(false);
    }
  }, []);

  /** 画面を動かす。動かす前に、会話画面を畳み、「AIに戻る」ための目印を残す(電話の画面は除く)。 */
  const go = useCallback(
    (target: AiNav) => {
      setNav(null);
      setChoices([]);
      if (target.kind !== "call") {
        try {
          sessionStorage.setItem(returnKey(shopId), "1");
        } catch {
          // 使えない環境では、戻る目印なしで動かす
        }
      }
      voiceOutput.cancel();
      onLeaveRef.current?.();
      // 会話画面が閉じるのを待ってから動かす(重なったまま動くのを避ける)。
      window.setTimeout(() => runNav(target), 60);
    },
    [shopId],
  );
  const cancelNav = useCallback(() => setNav(null), []);

  // 画面を動かす合図があったら、タップしなくても動かす(少し待つ間に「やめる」も押せる)。
  useEffect(() => {
    if (!nav) return;
    const t = window.setTimeout(() => go(nav), 2000);
    return () => window.clearTimeout(t);
  }, [nav, go]);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.replace(/\s+/g, " ").trim();
      if (!question || loading) return;
      setError(null);
      setNav(null);
      setChoices([]);
      setLoading(true);
      const now = Date.now();
      setMessages((m) => [...m, { id: now, role: "user", text: question }]);
      try {
        const res = await fetch(`/api/shops/${shopId}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, lang: locale }),
        });
        const json = (await res.json().catch(() => ({}))) as { answer?: string; error?: string; nav?: AiNav | null; choices?: AiChoice[] };
        if (res.ok && json.answer) {
          const answer = json.answer;
          setMessages((m) => [...m, { id: now + 1, role: "ai", text: answer }]);
          if (json.nav && (json.nav.path || json.nav.href)) setNav(json.nav);
          else if (Array.isArray(json.choices) && json.choices.length > 0) setChoices(json.choices);
          if (speakOn) voiceOutput.speak(answer, speechLang, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
        } else {
          const key = json.error && json.error in l.errors ? json.error : res.status === 503 ? "busy" : "failed";
          setError(l.errors[key]);
        }
      } catch {
        setError(l.errors.busy);
      } finally {
        setLoading(false);
      }
    },
    [shopId, locale, loading, l, speakOn, speechLang],
  );

  return { messages, loading, error, ask, labels: l, locale, nav, go, cancelNav, choices, speakOn, setSpeakOn, speaking, speechLang };
}

export type Ai = ReturnType<typeof useShopAi>;

export function ShopAiMessages({ ai }: { ai: Ai }) {
  if (ai.messages.length === 0 && !ai.loading && !ai.error && !ai.nav) return null;
  return (
    <div className="space-y-2 px-4" aria-live="polite">
      {ai.messages.map((m) => (
        <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
          <p
            className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              m.role === "user" ? "bg-main/10 text-main" : "border border-hl-400/30 bg-panel-950 text-tone-200"
            }`}
          >
            {m.text}
          </p>
        </div>
      ))}
      {ai.loading && <p className="text-xs text-tone-400">{ai.labels.thinking}</p>}
      {ai.error && <p className="text-xs text-red-400">{ai.error}</p>}
      {ai.nav && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-hl-400/40 bg-hl-500/10 px-3 py-2 text-sm text-hl-300">
          <span className="flex-1">{ai.nav.kind === "reserve" ? ai.labels.reserveOpening : ai.nav.kind === "call" ? ai.labels.callOpening : ai.labels.gotoOpening}</span>
          <button type="button" onClick={() => ai.go(ai.nav!)} className="rounded-full bg-cta-light px-3 py-1 text-xs font-bold text-on-cta-gold hover:bg-cta-hover">
            {ai.labels.openNow}
          </button>
          <button type="button" onClick={ai.cancelNav} className="text-xs text-tone-400 underline">
            {ai.labels.cancel}
          </button>
        </div>
      )}
      {ai.choices.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-[11px] font-semibold text-tone-400">{ai.labels.choicesTitle}</p>
          <div className="grid grid-cols-2 gap-2">
            {ai.choices.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => ai.go(c.nav)}
                className="rounded-xl border border-hl-400/30 bg-panel-950 px-3 py-3 text-left text-sm font-semibold text-main transition hover:border-hl-400/70"
              >
                {ai.labels.choiceLabels[c.key] ?? c.key}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ShopAiInput({ ai, showChips, placeholder, compact, autoStartVoice }: { ai: Ai; showChips?: boolean; placeholder?: string; compact?: boolean; autoStartVoice?: boolean }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const finalRef = useRef("");
  // 音声認識が使えない端末(一部のiPhoneなど)では、マイクのボタンを出さない。
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  const toggleVoice = useCallback(() => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    voiceOutput.cancel();
    const rec = new Ctor();
    rec.lang = ai.speechLang;
    rec.interimResults = true;
    rec.continuous = false;
    finalRef.current = "";
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(t);
      finalRef.current = t;
    };
    // 話し終えたら、タップしなくても、そのまま送信する。
    rec.onend = () => {
      setListening(false);
      const t = finalRef.current.trim();
      finalRef.current = "";
      if (t) {
        setText("");
        void ai.ask(t);
      }
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, [listening, ai]);
  const startedRef = useRef(false);
  useEffect(() => {
    if (autoStartVoice && voiceOk && !startedRef.current) {
      startedRef.current = true;
      toggleVoice();
    }
  }, [autoStartVoice, voiceOk, toggleVoice]);
  const submit = () => {
    const q = text;
    setText("");
    void ai.ask(q);
  };
  return (
    <div className="space-y-2">
      {showChips && ai.messages.length === 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ai.labels.chips.map((c) => (
            <button key={c} type="button" onClick={() => void ai.ask(c)} disabled={ai.loading} className="shrink-0 rounded-full border border-main/15 px-3 py-1 text-xs text-tone-300 hover:border-hl-400/50 hover:text-hl-300 disabled:opacity-50">
              {c}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`${compact ? "" : "mx-4 "}flex items-center gap-2 rounded-full border border-main/15 bg-main/5 py-1 pl-3 pr-1`}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-hl-300" />
        {/* 入力した文字は16px以上(未満だとiPhoneが自動で拡大する)。案内の文字だけ小さくして、狭い幅でも切れないようにしてある。 */}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder={listening ? ai.labels.listening : (placeholder ?? ai.labels.placeholder)}
          aria-label={ai.labels.title}
          className={`min-w-0 flex-1 bg-transparent py-1.5 text-base text-main placeholder-tone-500 outline-none ${compact ? "placeholder:text-[12px]" : ""}`}
        />
        {voiceOk && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={ai.loading}
            aria-label={ai.labels.voice}
            aria-pressed={listening}
            className={`rounded-full p-2 disabled:opacity-40 ${listening ? "animate-pulse bg-red-500 text-white" : "text-tone-300 hover:text-hl-300"}`}
          >
            <Mic className="h-4 w-4" />
          </button>
        )}
        <button type="submit" disabled={ai.loading || !text.trim()} aria-label={ai.labels.send} className="rounded-full bg-cta-light p-2 text-on-cta-gold disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
