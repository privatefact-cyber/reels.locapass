"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { boostText } from "@/lib/boost/text";
import type { BoostItem } from "@/lib/boost/types";
import { BoostCard } from "./BoostCard";
import { useNow } from "./BoostCountdown";

export function BoostDetail({ boost }: { boost: BoostItem | null }) {
  const { locale } = useLocale();
  const t = boostText(locale);
  const now = useNow(1000);
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pb-24 pt-4">
      <Link href="/boost" className="inline-flex items-center gap-1 text-sm font-bold text-amber-300">
        <ChevronLeft className="h-4 w-4" /> {t.back}
      </Link>
      {boost ? (
        <BoostCard boost={boost} now={now} t={t} />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-14 text-center text-base font-bold text-white">{t.endedPage}</div>
      )}
    </div>
  );
}
