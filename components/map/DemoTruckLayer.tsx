"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import { DEMO_TRUCK_ROUTES } from "@/lib/map/demoTruckRoutes";
import type { VenuePin } from "@/types/venue";

/**
 * デモ用の「走る広告トラック」。出店予定のあるデモ店が、決めた出発地から次の出店場所まで道路沿いに走り、
 * 着地して止まり、また出発地から走り出す、をループする。実際の運行ルートではなく、時計から位置を計算しているだけ。
 * 見た目は、ピカピカ光る店舗のアイコン(✨付き)。タップするとその店舗の詳細ページへ行く。
 * ルートが登録されている店・場所(lib/map/demoTruckRoutes.ts)でだけ動く。
 */
const SPEED_MPS = 50_000 / 3600; // 時速50km(幹線道路を走る実速に近い。広い範囲を走るので、1周は約6〜10分)
const HOLD_MS = 8_000; // 着地して止まっている時間(最後の0.6秒で消えて、次の出発へ)
const STAGGER_MS = 150_000; // 2台目以降は、出発をこれだけずらす
const STYLE_ID = "demo-truck-style-v2";

type Run = { id: string; coords: [number, number][]; cum: number[]; total: number; driveMs: number; offset: number; name: string; href: string; imageUrl: string | null };

function metersBetween(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function buildRun(pin: VenuePin, coords: [number, number][], offset: number): Run {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + metersBetween(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];
  return {
    id: pin.id,
    coords,
    cum,
    total,
    driveMs: (total / SPEED_MPS) * 1000,
    offset,
    name: pin.spot?.shop?.name ?? "",
    href: pin.spot?.shop?.href ?? "/map",
    imageUrl: pin.spot?.shop?.imageUrl ?? null,
  };
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

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@keyframes demoTruckHalo { 0%,100% { opacity: .55; transform: scale(.92); } 50% { opacity: 1; transform: scale(1.12); } }
@keyframes demoTruckTwinkle { 0%,100% { opacity: .15; transform: scale(.5) rotate(0deg); } 50% { opacity: 1; transform: scale(1.15) rotate(25deg); } }`;
  document.head.appendChild(style);
}

export function DemoTruckLayer({ map, pins }: { map: maplibregl.Map | null; pins: VenuePin[] }) {
  const router = useRouter();

  useEffect(() => {
    if (!map) return;
    const now0 = Date.now();
    const runs: Run[] = [];
    for (const p of pins) {
      if (!p.spot || Date.parse(p.spot.endsAt) < now0) continue;
      const route = DEMO_TRUCK_ROUTES[p.id]?.[`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`];
      if (route) runs.push(buildRun(p, route, runs.length * STAGGER_MS));
    }
    if (runs.length === 0) return;
    ensureStyle();

    const markers = runs.map((run) => {
      const el = document.createElement("div");
      el.setAttribute("role", "link");
      el.setAttribute("aria-label", run.name);
      el.title = run.name;
      el.style.cssText = "width:46px;height:46px;cursor:pointer;z-index:4;transition:opacity .25s;";
      // style="..." の中なので、url() の引用符はシングルにする(ダブルだと属性が壊れる)。
      const photo = run.imageUrl ? `background:#fff center/cover no-repeat url('${encodeURI(run.imageUrl).replace(/'/g, "%27")}');` : "background:#fff;";
      // アイコンの中は、はっきり見せる(白い枠だけ)。ぼわっと光るのは、後ろに敷いたぼかしの輪(halo)だけ。
      el.innerHTML =
        `<div style="position:absolute;left:-14px;top:-14px;width:74px;height:74px;border-radius:50%;pointer-events:none;background:radial-gradient(circle, rgba(251,191,36,0) 50%, rgba(251,191,36,.6) 62%, rgba(249,115,22,.4) 76%, rgba(249,115,22,0) 100%);filter:blur(4px);animation:demoTruckHalo 1.6s ease-in-out infinite;"></div>` +
        `<div data-ring style="position:relative;width:46px;height:46px;border-radius:50%;border:3px solid #f97316;box-sizing:border-box;${photo}box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:22px;">${run.imageUrl ? "" : "🚚"}</div>` +
        `<span style="position:absolute;right:-11px;bottom:-6px;width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid #f97316;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;"><span data-emoji style="display:inline-block;">🚚</span></span>` +
        `<span style="position:absolute;left:-18px;top:-12px;font-size:13px;pointer-events:none;animation:demoTruckTwinkle 1.1s ease-in-out infinite;">✨</span>` +
        `<span style="position:absolute;right:-14px;top:-16px;font-size:11px;pointer-events:none;animation:demoTruckTwinkle 1.1s ease-in-out .5s infinite;">✨</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        router.push(run.href);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(run.coords[0]).addTo(map);
      return { run, el, marker };
    });

    let raf = 0;
    const tick = () => {
      const t = Date.now();
      for (const { run, el, marker } of markers) {
        const phase = (t + run.offset) % (run.driveMs + HOLD_MS);
        const driving = phase < run.driveMs;
        const { lngLat, east } = positionAt(run, driving ? phase / run.driveMs : 1);
        marker.setLngLat(lngLat);
        // 東へ走るときは、左向きの絵文字を反転する。
        const emoji = el.querySelector<HTMLElement>("[data-emoji]");
        if (emoji && driving) emoji.style.transform = east ? "scaleX(-1)" : "none";
        const ring = el.querySelector<HTMLElement>("[data-ring]");
        if (ring) ring.style.borderColor = driving ? "#f97316" : "#22c55e";
        // 着地して止まったあと、次の出発の直前に消える。出発の瞬間にまた現れる。
        el.style.opacity = !driving && phase > run.driveMs + HOLD_MS - 600 ? "0" : "1";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      markers.forEach(({ marker }) => marker.remove());
    };
  }, [map, pins, router]);

  return null;
}
