"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { boostText } from "@/lib/boost/text";
import type { BoostItem } from "@/lib/boost/types";
import { BoostCard } from "./BoostCard";
import { useNow } from "./BoostCountdown";

const POLL_MS = 30_000;
/** 終了表示にしてからカードを消すまでの時間。 */
const FADE_MS = 6_000;

export function BoostFeed({ initial }: { initial: BoostItem[] }) {
  const { locale } = useLocale();
  const t = boostText(locale);
  const [items, setItems] = useState(initial);
  const now = useNow(1000);
  const busy = useRef(false);

  const refetch = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/boost", { cache: "no-store" });
      if (res.ok) setItems(((await res.json()) as { items: BoostItem[] }).items);
    } catch {
      // 通信失敗時は今の表示を維持する(次の周期で再取得)。
    } finally {
      busy.current = false;
    }
  }, []);

  // 新着はRealtimeで即反映。取りこぼし・購読不可の端末向けに30秒ごと&タブ復帰時にも再取得する。
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("boost-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "locapass_boost_posts" }, () => void refetch())
      .subscribe();
    const id = setInterval(() => void refetch(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void refetch();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(ch);
    };
  }, [refetch]);

  const visible = items.filter((b) => new Date(b.expiresAt).getTime() + FADE_MS > now);

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pb-16 pt-6">
      <header className="text-center">
        <h1 className="flex items-center justify-center gap-2 text-2xl font-black text-amber-300">
          <Zap className="h-6 w-6 fill-amber-300" /> {t.title}
        </h1>
        <p className="mt-2 text-sm text-white/70">{t.lead}</p>
        <p className="mt-1 text-[11px] text-white/40">{t.refresh}</p>
      </header>
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-14 text-center">
          <p className="text-base font-bold text-white">{t.empty}</p>
          <p className="mt-1 text-sm text-white/60">{t.emptySub}</p>
        </div>
      ) : (
        visible.map((b) => <BoostCard key={b.id} boost={b} now={now} t={t} />)
      )}
    </div>
  );
}
