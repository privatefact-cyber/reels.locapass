"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { MapPin, Search } from "lucide-react";
import { geocodeAddress } from "@/lib/map/addressGeocode";
import { updateShopPin } from "@/app/admin/locapass-shops/[shopId]/actions";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

type Props = {
  shopId: string;
  shopName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** 'address'(住所から自動取得) / 'area_fallback'(仮の位置) / 'manual'(調整済み) */
  geocodeSource: string | null;
};

/**
 * マップに出す店舗ピンの微調整UI。
 * 一括ジオコーディング(scripts/geocode-shops.ts)は住所の「番地」までしか解決できないため、
 * ビルの入口がずれている場合にここでドラッグして直す。保存すると geocode_source='manual'
 * になり、以降の一括処理で上書きされなくなる。
 */
export function ShopPinEditor({ shopId, shopName, address, lat, lng, geocodeSource }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // 東京駅を初期値にしておく(座標未設定の店舗はここからドラッグして決める)
  const [pin, setPin] = useState({ lat: lat ?? 35.6812, lng: lng ?? 139.7671 });
  const [query, setQuery] = useState(address ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [pin.lng, pin.lat],
      zoom: lat && lng ? 17 : 12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // maplibre-gl.cssが.maplibregl-map{position:relative}をあてるため、
    // コンテナのサイズ確定後にresize()しないと高さ0のままになることがある。
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    const marker = new maplibregl.Marker({ draggable: true, color: "#d4a537" })
      .setLngLat([pin.lng, pin.lat])
      .addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      setPin({ lat: p.lat, lng: p.lng });
      setStatus(null);
    });

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveTo = useCallback((next: { lat: number; lng: number }) => {
    setPin(next);
    markerRef.current?.setLngLat([next.lng, next.lat]);
    mapRef.current?.flyTo({ center: [next.lng, next.lat], zoom: 17, speed: 1.4 });
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setStatus("検索中…");
    const hit = await geocodeAddress(query);
    if (!hit) {
      setStatus("住所が見つかりませんでした。地図を直接ドラッグして調整してください。");
      return;
    }
    moveTo({ lat: hit.lat, lng: hit.lng });
    setStatus(`${hit.matched ?? query} に移動しました。ずれていればピンをドラッグしてください。`);
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    const result = await updateShopPin(shopId, pin.lat, pin.lng);
    setSaving(false);
    setStatus(result.ok ? "保存しました。マップにこの位置で表示されます。" : `保存に失敗しました: ${result.error}`);
  }

  const sourceLabel =
    geocodeSource === "manual"
      ? "手動で調整済み"
      : geocodeSource === "address"
        ? "住所から自動取得"
        : "仮の位置(要調整)";

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold text-neutral-900">
          <MapPin size={16} /> マップのピン位置
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            geocodeSource === "manual"
              ? "bg-emerald-100 text-emerald-700"
              : geocodeSource === "address"
                ? "bg-sky-100 text-sky-700"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          {sourceLabel}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        {shopName}がマップ上のどこに表示されるかを決めます。住所で検索してから、
        ビルの入口に合うようピンをドラッグしてください。
      </p>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded border border-neutral-300 px-3 py-2">
          <Search size={14} className="shrink-0 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="住所を入力して検索"
            className="min-w-0 flex-1 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded bg-neutral-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          検索
        </button>
      </form>

      <div ref={containerRef} className="h-72 w-full overflow-hidden rounded" style={{ position: "relative" }} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-neutral-500">
          {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
        >
          {saving ? "保存中…" : "この位置で保存"}
        </button>
      </div>

      {status && <p className="text-xs text-neutral-600">{status}</p>}
    </section>
  );
}
