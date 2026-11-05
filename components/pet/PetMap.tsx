"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import * as maplibreNs from "maplibre-gl";
import { LocateFixed, Loader2 } from "lucide-react";

// maplibre-glはCJS(UMD)なので、読み込み経路によってdefaultの有無が変わる(components/photo/PhotoMap.tsx と同じ対処)
const maplibregl: typeof maplibreNs = (maplibreNs as unknown as { default?: typeof maplibreNs }).default ?? maplibreNs;
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const DEFAULT_CENTER = { lat: 35.658, lng: 139.7016 }; // 渋谷

export type PetMapMarker = { id: string; lat: number; lng: number; kind: "lost" | "sighting" | "last_seen"; label?: string; imageUrl?: string | null; href?: string };

/**
 * ワンコ手帳の地図。
 * - markers: 迷子(赤)・目撃(黄)・最後に見た場所(ピーチ)のピン
 * - picker: 地図をタップ(または「現在地」)で場所を1つ選ぶ
 */
export function PetMap({
  markers = [],
  picker,
  height = 260,
  center,
}: {
  markers?: PetMapMarker[];
  picker?: { value: { lat: number; lng: number } | null; onChange: (v: { lat: number; lng: number }) => void };
  height?: number;
  center?: { lat: number; lng: number } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pickMarker = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(picker?.onChange);
  onChangeRef.current = picker?.onChange;
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const isPicker = Boolean(picker);
  const pickLat = picker?.value?.lat ?? null;
  const pickLng = picker?.value?.lng ?? null;

  useEffect(() => {
    if (!box.current) return;
    const start = picker?.value ?? center ?? (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : DEFAULT_CENTER);
    const map = new maplibregl.Map({ container: box.current, style: MAP_STYLE_URL, center: [start.lng, start.lat], zoom: 14, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    if (picker) {
      map.on("click", (e) => onChangeRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    }
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 表示用のピン
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const placed: maplibregl.Marker[] = [];
    for (const m of markers) {
      const el = document.createElement(m.href ? "a" : "div");
      if (m.href) (el as HTMLAnchorElement).href = m.href;
      const color = m.kind === "lost" ? "#D04848" : m.kind === "sighting" ? "#F2B705" : "#FF8E5E";
      el.style.cssText = `display:block;width:${m.imageUrl ? 46 : 30}px;height:${m.imageUrl ? 46 : 30}px;border-radius:9999px;border:3px solid ${color};background:#fff center/cover no-repeat;box-shadow:0 4px 10px rgba(0,0,0,.2);font-size:16px;line-height:24px;text-align:center;`;
      if (m.imageUrl) el.style.backgroundImage = `url("${m.imageUrl}")`;
      else el.textContent = m.kind === "sighting" ? "👀" : "🐶";
      if (m.label) el.title = m.label;
      placed.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([m.lng, m.lat]).addTo(map));
    }
    if (markers.length > 1 && !isPicker) {
      const b = new maplibregl.LngLatBounds();
      markers.forEach((m) => b.extend([m.lng, m.lat]));
      map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 0 });
    }
    return () => placed.forEach((p) => p.remove());
  }, [markers, isPicker]);

  // 選んだ場所のピン
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isPicker) return;
    if (pickLat === null || pickLng === null) {
      pickMarker.current?.remove();
      pickMarker.current = null;
      return;
    }
    if (!pickMarker.current) pickMarker.current = new maplibregl.Marker({ color: "#FF8E5E" }).setLngLat([pickLng, pickLat]).addTo(map);
    else pickMarker.current.setLngLat([pickLng, pickLat]);
  }, [isPicker, pickLat, pickLng]);

  function locate() {
    if (!navigator.geolocation) return setLocError("この端末では現在地を取れません");
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const v = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapRef.current?.easeTo({ center: [v.lng, v.lat], zoom: 15, duration: 500 });
        picker?.onChange(v);
      },
      () => {
        setLocating(false);
        setLocError("現在地を取れませんでした。地図をタップして選んでください");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-[24px] border-2 border-[#F1E1CF]" style={{ height }}>
        {/* maplibre-gl.css が .maplibregl-map に position:relative を付けるので、absolute ではなく高さ100%で広げる */}
        <div ref={box} className="h-full w-full" />
        {picker && (
          <button
            type="button"
            onClick={locate}
            className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[#EE6A36] shadow active:scale-95"
          >
            {locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
            現在地
          </button>
        )}
      </div>
      {picker && <p className="mt-1 px-1 text-xs text-[#B39C8C]">{locError ?? (picker.value ? "📍 場所を選びました(タップで変えられます)" : "地図をタップして場所を選んでください")}</p>}
    </div>
  );
}
