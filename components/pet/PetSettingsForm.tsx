"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { savePetSettings, unlinkPetLine } from "@/app/pet/actions";
import { geocode, reverseGeocode } from "@/lib/map/geocode";
import { PetMap } from "./PetMap";
import { PetCard, petButton, petInput } from "./ui";

type Props = {
  walk: { lat: number; lng: number } | null;
  walkLabel: string | null;
  lostAlertOptIn: boolean;
  lineLinked: boolean;
  lineNotify: boolean;
  lineReady: boolean;
};

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 text-left">
      <span>
        <span className="block text-sm font-extrabold">{label}</span>
        {sub && <span className="block text-xs text-[#9C8273]">{sub}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-[#FF8E5E]" : "bg-[#E8DCD0]"}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function PetSettingsForm(p: Props) {
  const router = useRouter();
  const [walk, setWalk] = useState(p.walk);
  const [label, setLabel] = useState(p.walkLabel ?? "");
  const [query, setQuery] = useState("");
  const [optIn, setOptIn] = useState(p.lostAlertOptIn);
  const [lineNotify, setLineNotify] = useState(p.lineNotify);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function pick(v: { lat: number; lng: number }) {
    setWalk(v);
    const a = await reverseGeocode(v.lat, v.lng);
    if (a) setLabel(a.replace(/[0-9０-９-]+$/, ""));
  }

  async function search() {
    if (!query.trim()) return;
    setBusy("search");
    const hit = await geocode(query);
    setBusy(null);
    if (hit) await pick(hit);
    else setMsg("場所が見つかりませんでした。地図をタップして選んでください");
  }

  async function saveWalk() {
    setBusy("walk");
    setMsg(null);
    const res = await savePetSettings({ walkLat: walk?.lat ?? null, walkLng: walk?.lng ?? null, walkAreaLabel: label });
    setBusy(null);
    setMsg(res.ok ? "散歩エリアを保存しました" : res.error);
    router.refresh();
  }

  async function saveToggle(patch: { lostAlertOptIn?: boolean; lineNotify?: boolean }) {
    const res = await savePetSettings(patch);
    if (!res.ok) setMsg(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#06A34A]">💬 LINEでお知らせを受け取る</h3>
        {p.lineLinked ? (
          <>
            <p className="rounded-2xl bg-[#E5F8EC] px-3 py-2 text-sm font-bold text-[#06A34A]">✓ LINEとつながっています</p>
            <Toggle
              on={lineNotify}
              onChange={(v) => {
                setLineNotify(v);
                saveToggle({ lineNotify: v });
              }}
              label="LINEにも送る"
              sub="ワクチン・狂犬病の期限、迷子アラート、フォロー申請"
            />
            <button
              type="button"
              onClick={async () => {
                if (!confirm("LINEとの連携を解除しますか?(アプリ内のお知らせは届きます)")) return;
                setBusy("unlink");
                await unlinkPetLine();
                setBusy(null);
                router.refresh();
              }}
              className={petButton.ghost}
            >
              {busy === "unlink" && <Loader2 size={14} className="animate-spin" />}
              連携を解除
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-[#7A6050]">ワクチン・狂犬病の時期が近づいたら(30日前・7日前・当日)、LINEにお知らせします。LOCAPASSの公式アカウントを友だち追加してください。</p>
            {p.lineReady ? (
              <a href="/api/pet/line/start" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] px-5 py-3 text-[15px] font-extrabold text-white shadow-[0_4px_0_#04A044] active:translate-y-[2px]">
                LINEで受け取る
              </a>
            ) : (
              <p className="rounded-2xl bg-[#F4EEE8] px-3 py-2 text-xs font-bold text-[#9C8273]">LINEでのお知らせは準備中です。いまはアプリ内のお知らせでお届けします。</p>
            )}
          </>
        )}
      </PetCard>

      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#D04848]">🚨 迷子アラート</h3>
        <Toggle
          on={optIn}
          onChange={(v) => {
            setOptIn(v);
            saveToggle({ lostAlertOptIn: v });
          }}
          label="近くの迷子犬のお知らせを受け取る"
          sub="散歩エリアから半径3km以内で迷子のお知らせが出たとき"
        />
      </PetCard>

      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#4FBF9F]">🗺️ 散歩エリア</h3>
        <p className="text-xs text-[#9C8273]">よく散歩する場所の近くを選んでください。ご自宅を正確に入れる必要はありません(約100m単位にまるめて保存し、ほかの人には見えません)。</p>
        <div className="flex gap-2">
          <input className={petInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="駅名・町名で探す(例: 渋谷)" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} />
          <button type="button" onClick={search} className="shrink-0 rounded-2xl bg-[#FFEBDD] px-4 text-[#C2562A]" aria-label="探す">
            {busy === "search" ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
        </div>
        <PetMap picker={{ value: walk, onChange: pick }} height={220} />
        {label && <p className="px-1 text-sm font-bold">📍 {label}</p>}
        <button type="button" onClick={saveWalk} disabled={busy === "walk"} className={`${petButton.primary} w-full`}>
          {busy === "walk" && <Loader2 size={18} className="animate-spin" />}
          散歩エリアを保存
        </button>
      </PetCard>
      {msg && <p className="text-center text-sm font-bold text-[#7A6050]">{msg}</p>}
    </div>
  );
}
