"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { addWalkArea, removeWalkArea, savePetSettings, unlinkPetLine, updateHereLocation } from "@/app/pet/actions";
import { geocode, reverseGeocode } from "@/lib/map/geocode";
import { PetMap } from "./PetMap";
import { PetCard, petButton, petInput } from "./ui";

type Props = {
  walkAreas: { id: string; lat: number; lng: number; label: string | null }[];
  lostAlertOptIn: boolean;
  hereAlertOptIn: boolean;
  lineLinked: boolean;
  lineNotify: boolean;
  lineReady: boolean;
};

const MAX_AREAS = 3;

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
  const [adding, setAdding] = useState(p.walkAreas.length === 0);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [optIn, setOptIn] = useState(p.lostAlertOptIn);
  const [hereOptIn, setHereOptIn] = useState(p.hereAlertOptIn);
  const [lineNotify, setLineNotify] = useState(p.lineNotify);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function pick(v: { lat: number; lng: number }) {
    setPoint(v);
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

  async function saveArea() {
    if (!point) return setMsg("地図をタップして場所を選んでください");
    setBusy("add");
    setMsg(null);
    const res = await addWalkArea({ lat: point.lat, lng: point.lng, label });
    setBusy(null);
    if (!res.ok) return setMsg(res.error);
    setAdding(false);
    setPoint(null);
    setLabel("");
    setQuery("");
    router.refresh();
  }

  async function toggleHere(v: boolean) {
    if (v) {
      // オンにするときだけ、位置情報の許可を求めて今の場所を覚える
      if (!navigator.geolocation) return setMsg("この端末では現在地を取れません");
      setBusy("here");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const res = await savePetSettings({ hereAlertOptIn: true });
          if (res.ok) await updateHereLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setBusy(null);
          setHereOptIn(res.ok);
          if (!res.ok) setMsg(res.error);
          router.refresh();
        },
        () => {
          setBusy(null);
          setMsg("位置情報が許可されていないため、オンにできませんでした");
        },
        { enableHighAccuracy: false, timeout: 10_000 },
      );
    } else {
      setHereOptIn(false);
      await savePetSettings({ hereAlertOptIn: false });
      router.refresh();
    }
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

      <PetCard className="space-y-4">
        <h3 className="text-sm font-extrabold text-[#D04848]">🚨 迷子アラート</h3>
        <Toggle
          on={optIn}
          onChange={(v) => {
            setOptIn(v);
            saveToggle({ lostAlertOptIn: v });
          }}
          label="散歩エリアの近くで受け取る"
          sub="登録した散歩エリアのどれかから半径3km以内で、迷子のお知らせ・見つけました通報が出たとき"
        />
        <div className="border-t border-[#F6EBDF] pt-4">
          <Toggle on={hereOptIn} onChange={toggleHere} label="いまいる場所の近くでも受け取る" sub="旅行先・おでかけ先でも届きます。ワンコ手帳を開いた場所を約100m単位で48時間だけ覚え、自動で消します" />
          {busy === "here" && <Loader2 size={14} className="mt-2 animate-spin text-[#B39C8C]" />}
        </div>
      </PetCard>

      <PetCard className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#4FBF9F]">🗺️ 散歩エリア(最大{MAX_AREAS}か所)</h3>
        <p className="text-xs text-[#9C8273]">自宅・職場・実家など、よく行く場所の近くを選んでください。ご自宅を正確に入れる必要はありません(約100m単位にまるめて保存し、ほかの人には見えません)。</p>
        {p.walkAreas.length > 0 && (
          <ul className="space-y-2">
            {p.walkAreas.map((a, i) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-2xl bg-[#F6FBF9] px-3 py-2.5">
                <span className="min-w-0 truncate text-sm font-bold">
                  {i + 1}. 📍 {a.label || `${a.lat.toFixed(3)}, ${a.lng.toFixed(3)}`}
                </span>
                <button
                  type="button"
                  aria-label="削除"
                  onClick={async () => {
                    if (!confirm("この散歩エリアを削除しますか?")) return;
                    const res = await removeWalkArea(a.id);
                    if (!res.ok) setMsg(res.error);
                    router.refresh();
                  }}
                  className="shrink-0 rounded-full p-1.5 text-[#C9B3A3]"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <div className="space-y-3 rounded-2xl border-2 border-dashed border-[#CDEFE3] p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-[#2E9C7C]">散歩エリアを追加</p>
              {p.walkAreas.length > 0 && (
                <button type="button" onClick={() => setAdding(false)} aria-label="閉じる" className="text-[#B39C8C]">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input className={petInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="駅名・町名で探す(例: 渋谷)" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} />
              <button type="button" onClick={search} className="shrink-0 rounded-2xl bg-[#FFEBDD] px-4 text-[#C2562A]" aria-label="探す">
                {busy === "search" ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </button>
            </div>
            <PetMap picker={{ value: point, onChange: pick }} center={p.walkAreas[0] ?? null} height={220} />
            <input className={petInput} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="名前(例: 自宅のあたり・職場)" maxLength={60} />
            <button type="button" onClick={saveArea} disabled={busy === "add"} className={`${petButton.primary} w-full`}>
              {busy === "add" && <Loader2 size={18} className="animate-spin" />}
              この場所を追加
            </button>
          </div>
        ) : (
          p.walkAreas.length < MAX_AREAS && (
            <button type="button" onClick={() => setAdding(true)} className={`${petButton.soft} w-full`}>
              <Plus size={16} />
              散歩エリアを追加
            </button>
          )
        )}
      </PetCard>
      {msg && <p className="text-center text-sm font-bold text-[#7A6050]">{msg}</p>}
    </div>
  );
}
