"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as maplibreNs from "maplibre-gl";
import { Camera, ChevronRight, Loader2, LocateFixed, MapPin, Search, X } from "lucide-react";
import { geocode } from "@/lib/map/geocode";
import { PLACE_CATEGORY_EMOJI, type PetSpot } from "@/lib/pet/spots";
import { PET_RETURN_KEY } from "./SpotsExplorer";
import { VerifiedBadge } from "./VerifiedBadge";

// maplibre-glはCJS(UMD)なので、読み込み経路によってdefaultの有無が変わる(components/photo/PhotoMap.tsx と同じ対処)
const maplibregl: typeof maplibreNs = (maplibreNs as unknown as { default?: typeof maplibreNs }).default ?? maplibreNs;
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const DEFAULT_CENTER = { lat: 35.658, lng: 139.7016, zoom: 11 }; // 渋谷
/** LOCAPASS認証のお店を写真ピンで出す上限(取り込んだ施設は、いつも点+まとめピン) */
const PHOTO_PIN_LIMIT = 60;
/** 取り込んだ施設の点の色(種類ごと) */
const PLACE_COLOR: Record<string, string> = { dog_run: "#4FBF9F", dog_ok: "#FF8E5E", vet: "#6AADEB", pet_shop: "#B58AE0", trimming: "#F27BA6", pet_hotel: "#E3A33B", training: "#E3A33B", other: "#B39C8C" };

type Filter = "all" | "verified" | "dog_run" | "with_pet" | "care" | "pet_shop" | "vet";

function matches(s: PetSpot, f: Filter) {
  if (f === "all") return true;
  if (f === "verified") return Boolean(s.verified);
  // 一緒に行ける店 = LOCAPASSの🐾のお店+OpenStreetMapの犬OKのお店
  if (f === "with_pet") return s.kinds.includes("with_pet") || s.placeCategory === "dog_ok";
  // トリミング・ホテル・しつけ
  if (f === "care") return s.placeCategory === "trimming" || s.placeCategory === "pet_hotel" || s.placeCategory === "training";
  return s.placeCategory === f;
}
type Snap = "peek" | "half" | "full";

function markReturn() {
  try {
    sessionStorage.setItem(PET_RETURN_KEY, "/pet/spots");
  } catch {
    // 保存できない環境では戻るボタンが出ないだけ
  }
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * おでかけ(全画面地図)。
 * - 地図で見えている範囲のお店だけをサーバーから取る(/api/pet/spots。施設が1000件を超えても重くならない)
 * - 下から引き出す一覧(つまみを上下にドラッグ/タップで 小・半分・全体)。一覧は「いま地図に出ているピン」のお店
 * - 虫眼鏡で場所を検索して移動、現在地へ移動
 */
export function SpotsMapExplorer({ origin }: { origin: { lat: number; lng: number } | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const cardRefs = useRef(new Map<string, HTMLAnchorElement>());

  const [spots, setSpots] = useState<PetSpot[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [center, setCenter] = useState(origin ?? DEFAULT_CENTER);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 引き出しの高さ
  const [wrapH, setWrapH] = useState(600);
  const [snap, setSnap] = useState<Snap>("peek");
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const snapH = useCallback((s: Snap) => (s === "peek" ? 128 : s === "half" ? Math.round(wrapH * 0.48) : Math.max(200, wrapH - 72)), [wrapH]);
  const sheetH = dragH ?? snapH(snap);

  // 一覧はLOCAPASS認証のお店を先頭に、その中で近い順(ロカわんはLOCAPASSへ案内するのが役目)
  const visible = useMemo(() => {
    return spots
      .filter((s) => matches(s, filter) && s.lat != null && s.lng != null)
      .map((s) => ({ ...s, dist: km(center, { lat: s.lat!, lng: s.lng! }) }))
      .sort((a, b) => Number(Boolean(b.verified)) - Number(Boolean(a.verified)) || a.dist - b.dist);
  }, [spots, filter, center]);

  // 見えている範囲のお店を取り直す(移動が止まってから)
  const load = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const c = map.getCenter();
    setCenter({ lat: c.lat, lng: c.lng });
    const q = new URLSearchParams({
      minLat: b.getSouth().toFixed(3),
      maxLat: b.getNorth().toFixed(3),
      minLng: b.getWest().toFixed(3),
      maxLng: b.getEast().toFixed(3),
    });
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(`/api/pet/spots?${q}`, { signal: ac.signal });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { spots: PetSpot[]; truncated: boolean };
      setSpots(body.spots);
      setTruncated(body.truncated);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNotice("お店を読み込めませんでした");
    } finally {
      if (abortRef.current === ac) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mapBox.current) return;
    const start = origin ? { ...origin, zoom: 13 } : DEFAULT_CENTER;
    const map = new maplibregl.Map({ container: mapBox.current, style: MAP_STYLE_URL, center: [start.lng, start.lat], zoom: start.zoom, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // 地図の出典表記(OpenStreetMap等。表示義務あり)。左上は検索欄、下は引き出しで隠れるので右上に置く
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
    let timer: ReturnType<typeof setTimeout> | null = null;
    map.on("moveend", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 350);
    });
    map.on("load", () => {
      // 出典表記は最初「i」に畳んでおく(開いたままだと絞り込みボタンに重なる。押せば開く)
      map.getContainer().querySelectorAll(".maplibregl-ctrl-attrib").forEach((el) => el.classList.remove("maplibregl-compact-show"));
      map.addSource("spots", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 46, clusterMaxZoom: 15 });
      map.addLayer({
        id: "spot-clusters",
        type: "circle",
        source: "spots",
        filter: ["has", "point_count"],
        // 取り込んだ施設のまとめピンは控えめな青(LOCAPASS認証のお店の金色を目立たせる)
        paint: { "circle-color": "#8DB8E4", "circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 50, 24], "circle-stroke-width": 2, "circle-stroke-color": "#fff", "circle-opacity": 0.9 },
      });
      map.addLayer({
        id: "spot-count",
        type: "symbol",
        source: "spots",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#fff" },
      });
      map.addLayer({
        id: "spot-point",
        type: "circle",
        source: "spots",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": ["get", "color"], "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });
      map.on("click", "spot-clusters", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const src = map.getSource("spots") as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(f.properties?.cluster_id, (err: Error | null | undefined, zoom: number | null | undefined) => {
          if (!err) map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom ?? map.getZoom() + 2 });
        });
      });
      map.on("click", "spot-point", (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) selectSpot(id);
      });
      load();
    });
    const ro = new ResizeObserver(() => {
      map.resize();
      if (wrap.current) setWrapH(wrap.current.clientHeight);
    });
    ro.observe(mapBox.current);
    if (wrap.current) setWrapH(wrap.current.clientHeight);
    return () => {
      ro.disconnect();
      abortRef.current?.abort();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSpot = useCallback((id: string) => {
    setSelected(id);
    setSnap((s) => (s === "peek" ? "half" : s));
    setTimeout(() => cardRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 250);
  }, []);

  // ピンを描く: LOCAPASS認証のお店は写真ピン(認証マーク付き)、取り込んだ施設は色分けした点+まとめピン
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const verified = visible.filter((s) => s.verified).slice(0, PHOTO_PIN_LIMIT);
    const others = visible.filter((s) => !s.verified);
    const apply = () => {
      const src = map.getSource("spots") as maplibregl.GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: others.map((s) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [s.lng!, s.lat!] },
          properties: { id: s.id, color: PLACE_COLOR[s.placeCategory ?? "other"] ?? PLACE_COLOR.other },
        })),
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    for (const s of verified) {
      const el = document.createElement("button");
      el.type = "button";
      const big = s.id === selected;
      const size = big ? 58 : 46;
      el.style.cssText = `position:relative;display:block;width:${size}px;height:${size}px;border-radius:9999px;border:3px solid #F59E0B;background:#fff center/cover no-repeat;box-shadow:0 4px 12px rgba(245,158,11,.45);font-size:18px;line-height:${size - 8}px;text-align:center;cursor:pointer;`;
      if (s.imageUrl) el.style.backgroundImage = `url("${s.imageUrl}")`;
      else el.textContent = "🐾";
      // 右下の認証チェック
      const check = document.createElement("span");
      check.textContent = "✓";
      check.style.cssText = "position:absolute;right:-4px;bottom:-4px;width:18px;height:18px;border-radius:9999px;background:#F59E0B;color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center;border:2px solid #fff;";
      el.appendChild(check);
      el.title = `${s.name}(LOCAPASS認証)`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectSpot(s.id);
      });
      markersRef.current.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([s.lng!, s.lat!]).addTo(map));
    }
  }, [visible, selected, selectSpot]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setNotice(null);
    const hit = await geocode(query);
    setSearching(false);
    if (!hit) return setNotice("場所が見つかりませんでした");
    mapRef.current?.flyTo({ center: [hit.lng, hit.lat], zoom: 13, duration: 900 });
    (document.activeElement as HTMLElement | null)?.blur();
  }

  function locate() {
    if (!navigator.geolocation) return setNotice("この端末では現在地を取れません");
    navigator.geolocation.getCurrentPosition(
      (pos) => mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14, duration: 900 }),
      () => setNotice("現在地を取れませんでした"),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  // 引き出しのドラッグ
  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: sheetH, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    if (Math.abs(dy) > 4) drag.current.moved = true;
    setDragH(Math.min(snapH("full"), Math.max(snapH("peek"), drag.current.h + dy)));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // タップ: 小→半分→全体→小
      setSnap((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"));
      setDragH(null);
      return;
    }
    const h = dragH ?? d.h;
    const nearest = (["peek", "half", "full"] as Snap[]).reduce((a, b) => (Math.abs(snapH(b) - h) < Math.abs(snapH(a) - h) ? b : a));
    setSnap(nearest);
    setDragH(null);
  }

  const chip = (v: Filter, label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => setFilter(v)}
      className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-extrabold shadow-sm transition ${filter === v ? "bg-[#FF8E5E] text-white" : "bg-white/95 text-[#7A6050]"}`}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={wrap}
      className="fixed inset-x-0 bottom-[calc(69px+env(safe-area-inset-bottom))] top-[calc(56px+env(safe-area-inset-top))] z-20 mx-auto max-w-3xl overflow-hidden md:rounded-3xl"
    >
      <div ref={mapBox} className="h-full w-full" />

      {/* 上: 検索・絞り込み */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 space-y-2 pr-11">
        <form onSubmit={search} className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 py-1.5 pl-4 pr-1.5 shadow-[0_6px_18px_-8px_rgba(122,80,40,0.5)]">
          <Search size={18} className="shrink-0 text-[#B39C8C]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="場所を探す(例: 渋谷、代々木公園)"
            className="min-w-0 flex-1 bg-transparent text-base text-[#4A3426] outline-none placeholder:text-[#C9B3A3]"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="消す" className="shrink-0 p-1 text-[#C9B3A3]">
              <X size={16} />
            </button>
          )}
          <button type="submit" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF8E5E] text-white" aria-label="探す">
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </button>
        </form>
        <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1">
          {chip("all", "すべて")}
          {chip("verified", "✓ LOCAPASS認証")}
          {chip("dog_run", "🐕 ドッグラン")}
          {chip("with_pet", "🐾 一緒に行ける店")}
          {chip("care", "✂️ トリミング・ホテル")}
          {chip("pet_shop", "🛍️ ペットショップ")}
          {chip("vet", "🏥 動物病院")}
          <button type="button" onClick={locate} className="flex shrink-0 items-center gap-1 rounded-full bg-white/95 px-3 py-2 text-xs font-extrabold text-[#EE6A36] shadow-sm">
            <LocateFixed size={13} />
            現在地
          </button>
        </div>
        {notice && (
          <p className="pointer-events-auto inline-block rounded-full bg-[#4A3426]/85 px-3 py-1.5 text-xs font-bold text-white" onClick={() => setNotice(null)}>
            {notice}
          </p>
        )}
      </div>

      {/* 下: 引き出し(つまみを上下にドラッグ、タップで切り替え) */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-[28px] bg-[#FFF7EC] shadow-[0_-10px_30px_-12px_rgba(74,52,38,0.45)]"
        style={{ height: sheetH, transition: dragH === null ? "height 220ms ease" : "none" }}
      >
        <div
          className="shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-2.5 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="button"
          aria-label="一覧を開く・閉じる"
        >
          <div className="mx-auto h-1.5 w-12 rounded-full bg-[#E3CDB8]" />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm font-extrabold text-[#4A3426]">
              この範囲に {visible.length}件{truncated ? "+" : ""}
              {loading && <Loader2 size={13} className="ml-1.5 inline animate-spin text-[#B39C8C]" />}
            </p>
            <p className="text-[11px] text-[#B39C8C]">{snap === "full" ? "下げると地図" : "上げると一覧"}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-4">
          {visible.length === 0 && !loading && (
            <p className="py-6 text-center text-sm text-[#9C8273]">この範囲にお店はありません。地図を動かすか、場所を検索してください。</p>
          )}
          <Link
            href="/pet/post"
            className="flex items-center gap-3 rounded-[22px] border-2 border-dashed border-[#FFC9A8] bg-[#FFF3E6] p-3 active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF8E5E] text-white">
              <Camera size={20} />
            </span>
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-[#7A6050]">
              <b className="block text-sm text-[#4A3426]">ドッグランで遊んだ?いいカフェあった?</b>
              うちの子の写真を投稿してみませんか。場所を付けると LOCAPASS snap と施設のページにも並びます。
            </span>
            <ChevronRight size={16} className="shrink-0 text-[#E3A27F]" />
          </Link>
          {truncated && <p className="px-1 text-[11px] text-[#B39C8C]">お店が多いので、地図の真ん中に近い300件を出しています。拡大すると絞れます。</p>}
          {visible.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              onClick={s.verified ? markReturn : undefined}
              ref={(el) => {
                if (el) cardRefs.current.set(s.id, el);
                else cardRefs.current.delete(s.id);
              }}
              className={`flex items-center gap-3 rounded-[22px] border p-2.5 transition active:scale-[0.99] ${s.verified ? "bg-gradient-to-r from-[#FFFBEB] to-white" : "bg-white"} ${selected === s.id ? "border-[#FF8E5E] shadow-[0_0_0_3px_rgba(255,142,94,0.25)]" : s.verified ? "border-[#FCD34D]" : "border-[#F1E1CF]"}`}
            >
              {s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" loading="lazy" />
              ) : (
                <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl ${s.placeCategory === "dog_run" ? "bg-[#E5F7F0]" : s.placeCategory === "dog_ok" ? "bg-[#FFEBDD]" : "bg-[#E8F3FD]"}`}>
                  {s.placeCategory ? PLACE_CATEGORY_EMOJI[s.placeCategory] : "🐾"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {s.verified && (
                  <div className="mb-0.5">
                    <VerifiedBadge />
                  </div>
                )}
                <p className="truncate text-sm font-extrabold text-[#4A3426]">{s.name}</p>
                <p className="truncate text-xs text-[#9C8273]">{[s.area, s.category].filter(Boolean).join(" ・ ") || s.address}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.verified && s.kinds.includes("facility") && <span className="rounded-full bg-[#E8F3FD] px-2 py-0.5 text-[10px] font-bold text-[#3F7FBF]">ペット施設</span>}
                  {s.kinds.includes("with_pet") && <span className="rounded-full bg-[#FFEBDD] px-2 py-0.5 text-[10px] font-bold text-[#C2562A]">🐾 一緒に行ける</span>}
                  <span className="rounded-full bg-[#F4EEE8] px-2 py-0.5 text-[10px] font-bold text-[#7A6050]">{s.dist < 1 ? `${Math.round(s.dist * 1000)}m` : `${s.dist.toFixed(1)}km`}</span>
                </div>
              </div>
              <button
                type="button"
                aria-label="地図で見る"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelected(s.id);
                  setSnap("peek");
                  mapRef.current?.flyTo({ center: [s.lng!, s.lat!], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 700 });
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF3E6] text-[#EE6A36]"
              >
                <MapPin size={16} />
              </button>
              <ChevronRight size={16} className="-ml-1 shrink-0 text-[#D9C4B4]" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
