"use client";

import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import { DEMO_TRUCK_ROUTES } from "@/lib/map/demoTruckRoutes";
import type { VenuePin } from "@/types/venue";

/**
 * デモ用の「走る広告トラック」。出店予定のあるデモ店が、決めた出発地から次の出店場所まで道路沿いに走り、
 * 着地して少し止まり、また出発地から走り出す、をループする。実際の運行ルートではなく、時計から位置を計算しているだけ。
 * ルートが登録されている店・場所(lib/map/demoTruckRoutes.ts)でだけ動く。
 */
const DRIVE_MS = 16_000; // 出発地から着地まで
const HOLD_MS = 4_500; // 着地して止まっている時間(最後の0.6秒で消えて、次の出発へ)
const SOURCE_ID = "demo-truck-routes";
const LAYER_ID = "demo-truck-routes-line";

type Run = { id: string; coords: [number, number][]; cum: number[]; total: number; offset: number };

function buildRun(id: string, coords: [number, number][], offset: number): Run {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = (coords[i][0] - coords[i - 1][0]) * Math.cos((coords[i][1] * Math.PI) / 180);
    const dy = coords[i][1] - coords[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { id, coords, cum, total: cum[cum.length - 1], offset };
}

/** 道のりの割合(0〜1)から、位置と進行方向(東向きか)を求める。 */
function positionAt(run: Run, ratio: number): { lngLat: [number, number]; east: boolean } {
  const target = Math.min(Math.max(ratio, 0), 1) * run.total;
  let i = 1;
  while (i < run.cum.length - 1 && run.cum[i] < target) i++;
  const seg = run.cum[i] - run.cum[i - 1] || 1;
  const f = (target - run.cum[i - 1]) / seg;
  const a = run.coords[i - 1];
  const b = run.coords[i];
  return { lngLat: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], east: b[0] >= a[0] };
}

export function DemoTruckLayer({ map, pins }: { map: maplibregl.Map | null; pins: VenuePin[] }) {
  useEffect(() => {
    if (!map) return;
    const now0 = Date.now();
    const runs: Run[] = [];
    for (const p of pins) {
      if (!p.spot || Date.parse(p.spot.endsAt) < now0) continue;
      const route = DEMO_TRUCK_ROUTES[p.id]?.[`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`];
      if (route) runs.push(buildRun(p.id, route, runs.length * 5_500));
    }
    if (runs.length === 0) return;

    // 走るルートの点線(薄いオレンジ)
    const data = {
      type: "FeatureCollection" as const,
      features: runs.map((r) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: r.coords } })),
    };
    const existing = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (existing) existing.setData(data);
    else {
      map.addSource(SOURCE_ID, { type: "geojson", data });
      map.addLayer({ id: LAYER_ID, type: "line", source: SOURCE_ID, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f97316", "line-width": 3, "line-opacity": 0.55, "line-dasharray": [1.5, 2] } });
    }

    const markers = runs.map((run) => {
      const el = document.createElement("div");
      el.style.cssText = "width:34px;height:34px;pointer-events:none;z-index:4;transition:opacity .25s;";
      el.innerHTML = `<div data-ring style="width:34px;height:34px;border-radius:50%;background:#fff;border:3px solid #f97316;box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.45);"><span data-emoji style="font-size:18px;line-height:1;display:inline-block;">🚚</span></div>`;
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(run.coords[0]).addTo(map);
      return { run, el, marker };
    });

    let raf = 0;
    const tick = () => {
      const t = Date.now();
      for (const { run, el, marker } of markers) {
        const phase = (t + run.offset) % (DRIVE_MS + HOLD_MS);
        const driving = phase < DRIVE_MS;
        const { lngLat, east } = positionAt(run, driving ? phase / DRIVE_MS : 1);
        marker.setLngLat(lngLat);
        // 東へ走るときは、左向きの絵文字を反転する。
        const emoji = el.querySelector<HTMLElement>("[data-emoji]");
        if (emoji && driving) emoji.style.transform = east ? "scaleX(-1)" : "none";
        const ring = el.querySelector<HTMLElement>("[data-ring]");
        if (ring) ring.style.borderColor = driving ? "#f97316" : "#22c55e";
        // 着地して止まったあと、次の出発の直前に消える。出発の瞬間にまた現れる。
        el.style.opacity = !driving && phase > DRIVE_MS + HOLD_MS - 600 ? "0" : "1";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      markers.forEach(({ marker }) => marker.remove());
      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: "FeatureCollection", features: [] });
    };
  }, [map, pins]);

  return null;
}
