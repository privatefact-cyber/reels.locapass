"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { RotateCcw, Send, Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { SAMPLE_QUESTIONS, supportText } from "@/lib/support/text";

type Doc = { id: string; audience: "user" | "shop"; title: string; body: string };
type Msg = { role: "user" | "ai"; text: string; links?: { title: string; url: string }[]; unanswered?: boolean; question?: string };

export function SupportCenter({ docs, isShop }: { docs: Doc[]; isShop: boolean }) {
  const { locale } = useLocale();
  const t = supportText(locale);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"user" | "shop">("user");
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    setMsgs((p) => [...p, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, history, path: "/support" }),
      });
      const data = await res.json();
      setMsgs((p) => [...p, { role: "ai", text: data?.reply ?? "エラーが発生しました。", links: data?.links, unanswered: data?.answered === false, question: q }]);
    } catch {
      setMsgs((p) => [...p, { role: "ai", text: "通信に失敗しました。もう一度お試しください。" }]);
    } finally {
      setLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  }

  async function escalate(i: number, question: string) {
    const res = await fetch("/api/support/escalate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, contact }) });
    if (res.ok) setSent((p) => ({ ...p, [i]: true }));
  }

  const samples = SAMPLE_QUESTIONS[isShop && tab === "shop" ? "shop" : "user"];
  const shown = docs.filter((d) => d.audience === tab);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-6 text-main">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-black">
          <Sparkles className="h-5 w-5 text-accent" /> {t.title}
        </h1>
        <p className="mt-1 text-sm text-tone-300">{t.lead}</p>
      </header>

      <section className="rounded-2xl border border-main/10 bg-tone-900/60 p-3">
        <div className="min-h-[120px] space-y-3">
          {msgs.length === 0 ? (
            <div className="space-y-2 py-2">
              <p className="text-xs text-tone-500">{t.empty}</p>
              <p className="text-[11px] font-bold text-tone-300">{t.sample}</p>
              <div className="flex flex-wrap gap-2">
                {samples.map((s) => (
                  <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-tone-700 px-3 py-1.5 text-xs text-tone-200 hover:border-accent hover:text-accent">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "space-y-1.5"}>
                <div dir="auto" className={`max-w-[90%] whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "border-main/20 bg-main/15" : "border-main/10 bg-main/5 text-tone-200"}`}>
                  {m.text}
                </div>
                {m.links && m.links.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-tone-500">{t.links}:</span>
                    {m.links.map((l) => (
                      <Link key={l.url} href={l.url} className="rounded-full bg-accent/15 px-2.5 py-1 text-accent underline-offset-2 hover:underline">
                        {l.title}
                      </Link>
                    ))}
                  </div>
                )}
                {m.unanswered && m.question && (
                  <div className="space-y-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-100">
                    {sent[i] ? (
                      <p>{t.escalated}</p>
                    ) : (
                      <>
                        <p>{t.unknown}</p>
                        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t.contactPh} maxLength={200} className="w-full rounded-lg border border-amber-400/40 bg-black/30 px-2 py-1.5 text-[16px] text-main" />
                        <button type="button" onClick={() => void escalate(i, m.question!)} className="rounded-lg bg-amber-400 px-3 py-1.5 font-bold text-black">
                          {t.escalate}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          {loading && <p className="text-xs text-tone-500">{t.thinking}</p>}
          <div ref={endRef} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder={t.placeholder} className="min-w-0 flex-1 rounded-full border border-tone-700 bg-main/5 px-4 py-2.5 text-[16px] text-main placeholder:text-tone-500 focus:outline-none" />
          <button type="submit" disabled={loading || !input.trim()} aria-label={t.send} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40">
            <Send size={16} />
          </button>
          {msgs.length > 0 && (
            <button type="button" onClick={() => setMsgs([])} aria-label={t.reset} title={t.reset} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-tone-700 text-tone-300">
              <RotateCcw size={15} />
            </button>
          )}
        </form>
        <p className="mt-2 text-[10px] text-tone-500">{t.disclaimer}</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold">{t.guide}</h2>
        {isShop && (
          <div className="mb-3 flex gap-1 rounded-lg border border-main/10 bg-page/20 p-1" role="tablist">
            {(["user", "shop"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${tab === k ? "bg-main/10 text-accent" : "text-main/50"}`}>
                {k === "user" ? t.user : t.shop}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {shown.map((d) => (
            <details key={d.id} className="rounded-xl border border-main/10 bg-tone-900/60 px-3 py-2.5">
              <summary className="cursor-pointer text-sm font-bold">{d.title}</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-tone-300">{d.body}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
