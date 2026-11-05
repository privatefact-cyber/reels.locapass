"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, LocateFixed, Loader2 } from "lucide-react";
import type { PetSpot } from "@/lib/pet/spots";
import { PetMap, type PetMapMarker } from "./PetMap";
import { PetCard } from "./ui";

/** 店舗ページからワンコ手帳へ戻るボタン(components/pet/PetReturnButton.tsx)を出すための印 */
export const PET_RETURN_KEY = "locapass_pet_return";

function markReturn(to: string) {
  try {
    sessionStorage.setItem(PET_RETURN_KEY, to);
  } catch {
    // 保存できない環境では戻るボタンが出ないだけ
  }
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

type Filter = "all" | "facility" | "with_pet";

/** おでかけ: ペット施設・一緒に行ける店を、地図と近い順の一覧で */
export function SpotsExplorer({ spots, origin: initialOrigin }: { spots: PetSpot[]; origin: { lat: number; lng: number; label: string } | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [origin, setOrigin] = useState(initialOrigin);
  const [locating, setLocating] = useState(false);

  const list = useMemo(() => {
    const filtered = spots.filter((s) => filter === "all" || s.kinds.includes(filter));
    const withDist = filtered.map((s) => ({ ...s, km: origin && s.lat != null && s.lng != null ? distanceKm(origin, { lat: s.lat, lng: s.lng }) : null }));
    return withDist.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.name.localeCompare(b.name, "ja"));
  }, [spots, filter, origin]);

  const markers: PetMapMarker[] = useMemo(
    () => list.filter((s) => s.lat != null && s.lng != null).map((s) => ({ id: s.id, lat: s.lat!, lng: s.lng!, kind: "shop" as const, label: s.name, imageUrl: s.imageUrl, href: s.href })),
    [list],
  );

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "現在地" });
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  const tab = (v: Filter, label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => setFilter(v)}
      className={`rounded-full px-3.5 py-2 text-xs font-extrabold transition ${filter === v ? "bg-[#FF8E5E] text-white shadow-[0_2px_0_#EE6A36]" : "bg-white text-[#9C8273]"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {tab("all", "すべて")}
        {tab("facility", "🏠 ペット施設")}
        {tab("with_pet", "🐾 一緒に行ける店")}
      </div>
      <div className="mt-2 flex items-center justify-between px-1 text-xs text-[#9C8273]">
        <span>{origin ? `📍 ${origin.label}から近い順` : "名前順"}</span>
        <button type="button" onClick={locate} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-bold text-[#EE6A36] shadow-sm active:scale-95">
          {locating ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
          現在地から
        </button>
      </div>

      {markers.length > 0 && (
        <div className="mt-2" onClickCapture={(e) => (e.target as HTMLElement).closest("a") && markReturn("/pet/spots")}>
          <PetMap markers={markers} height={260} center={origin} />
        </div>
      )}

      <div className="mt-3 space-y-2">
        {list.length === 0 ? (
          <PetCard className="text-center text-sm text-[#9C8273]">まだ登録されているお店がありません</PetCard>
        ) : (
          list.map((s) => (
            <Link key={s.id} href={s.href} onClick={() => markReturn("/pet/spots")} className="block active:scale-[0.99]">
              <PetCard className="flex items-center gap-3 p-3">
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#E8F3FD] text-2xl">🐾</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{s.name}</p>
                  <p className="truncate text-xs text-[#9C8273]">{[s.area, s.category].filter(Boolean).join(" ・ ") || s.address}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.kinds.includes("facility") && <span className="rounded-full bg-[#E8F3FD] px-2 py-0.5 text-[10px] font-bold text-[#3F7FBF]">ペット施設</span>}
                    {s.kinds.includes("with_pet") && <span className="rounded-full bg-[#FFEBDD] px-2 py-0.5 text-[10px] font-bold text-[#C2562A]">🐾 一緒に行ける</span>}
                    {s.km != null && <span className="rounded-full bg-[#F4EEE8] px-2 py-0.5 text-[10px] font-bold text-[#7A6050]">{s.km < 1 ? `${Math.round(s.km * 1000)}m` : `${s.km.toFixed(1)}km`}</span>}
                  </div>
                </div>
                <ChevronRight className="shrink-0 text-[#D9C4B4]" size={18} />
              </PetCard>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
