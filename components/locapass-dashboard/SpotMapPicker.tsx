"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Search } from "lucide-react";
import { geocodeAddress } from "@/lib/map/addressGeocode";
import { reverseGeocode } from "@/lib/map/geocode";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export type Spot = { lat: number; lng: number; address: string };

/**
 * 出店場所を決める地図。住所で検索するか、地図をタップ/ピンをドラッグして決める。
 * 決まった位置は住所に逆引きして onChange で返す(住所が取れなければ空文字。手で直せる)。
 */
export function SpotMapPicker({ value, onChange }: { value: Spot | null; onChange: (spot: Spot) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function place(lat: number, lng: number, address?: string) {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ draggable: true, color: "#f97316" }).setLngLat([lng, lat]).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        void place(p.lat, p.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
    onChangeRef.current({ lat, lng, address: address ?? "" });
    if (address === undefined) {
      const addr = await reverseGeocode(lat, lng);
      onChangeRef.current({ lat, lng, address: addr ?? "" });
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [value?.lng ?? 140.471, value?.lat ?? 36.366],
      zoom: value ? 16 : 12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    map.on("click", (e) => void place(e.lngLat.lat, e.lngLat.lng));
    mapRef.current = map;
    if (value) void place(value.lat, value.lng, value.address);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setStatus("検索中…");
    const hit = await geocodeAddress(query);
    if (!hit) {
      setStatus("見つかりませんでした。地図をタップして場所を選んでください。");
      return;
    }
    mapRef.current?.flyTo({ center: [hit.lng, hit.lat], zoom: 16, speed: 1.4 });
    await place(hit.lat, hit.lng, query.trim());
    setStatus("ずれていれば、ピンをドラッグしてください。");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2">
          <Search size={14} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search(e);
            }}
            placeholder="住所を入力して検索"
            className="min-w-0 flex-1 bg-white text-sm text-slate-900 placeholder-slate-500 outline-none"
          />
        </div>
        <button type="button" onClick={(e) => void search(e)} className="shrink-0 rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          検索
        </button>
      </div>
      <div ref={containerRef} className="h-64 w-full overflow-hidden rounded" style={{ position: "relative" }} />
      {status && <p className="text-xs text-slate-500">{status}</p>}
    </div>
  );
}
