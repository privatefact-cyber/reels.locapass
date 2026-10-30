"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { eventShopDict } from "@/lib/shop/eventWording";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Navigation } from "lucide-react";

export type ScheduleSpot = { id: string; address: string | null; lat: number; lng: number; startsAt: string; endsAt: string; note: string | null };

/** 白地のスキン(cafe・beauty)では明るい地図、それ以外は暗い地図。 */
const MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const MAP_STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

/** ISO文字列 → JSTの日付キー(YYYY-MM-DD)。 */
function jstKey(iso: string | number): string {
  return new Date((typeof iso === "number" ? iso : Date.parse(iso)) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function jstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
}

/**
 * 移動販売の出店スケジュール。月カレンダー(出店のある日に点)で日を選ぶと、その日の場所・時間・ルート案内のカードと、
 * 場所を示す小さな地図が出る。営業中の日はオレンジの点、今日は枠で示す。
 * 見せる条件(複数の日にまたがる予定があるとき)は呼び出し側で決める。
 */
export function ShopScheduleCalendar({ spots, routeLabel, eventMode = false }: { spots: ScheduleSpot[]; routeLabel: string; eventMode?: boolean }) {
  const { t: baseT, locale } = useLocale();
  // 「開催場所のお知らせ」オプションの店は、「出店」を「開催」の言い方にする。
  const t = eventMode ? { ...baseT, shop: eventShopDict(baseT.shop, locale) } : baseT;
  const WEEKDAYS = t.shop.weekdays;
  const todayKey = jstKey(Date.now());
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleSpot[]>();
    for (const s of [...spots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const k = jstKey(s.startsAt);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [spots]);

  // 最初に選ぶ日: 今日に出店があれば今日、なければ次の出店日。
  const firstKey = byDay.has(todayKey) ? todayKey : ([...byDay.keys()].sort().find((k) => k >= todayKey) ?? [...byDay.keys()].sort()[0]);
  const [selected, setSelected] = useState<string>(firstKey);
  const [month, setMonth] = useState(() => firstKey.slice(0, 7)); // YYYY-MM

  const [y, mo] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const shiftMonth = (d: number) => {
    const next = new Date(Date.UTC(y, mo - 1 + d, 1));
    setMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const dayEvents = byDay.get(selected) ?? [];
  const nowMs = Date.now();

  // 選んだ日の場所を示すミニ地図
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: mapEl.current, style: ["cafe", "beauty"].includes(document.documentElement.getAttribute("data-theme") ?? "") ? MAP_STYLE_LIGHT : MAP_STYLE_DARK, center: [spots[0].lng, spots[0].lat], zoom: 14, attributionControl: false, cooperativeGestures: true });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapEl.current);
    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    markers.current = dayEvents.map((e, i) => {
      const el = document.createElement("div");
      el.style.cssText = "width:30px;height:30px;border-radius:50%;background:#f97316;border:2.5px solid #fff;color:#000;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.6);";
      el.textContent = String(i + 1);
      return new maplibregl.Marker({ element: el }).setLngLat([e.lng, e.lat]).addTo(map);
    });
    if (dayEvents.length === 1) map.flyTo({ center: [dayEvents[0].lng, dayEvents[0].lat], zoom: 15, speed: 1.4 });
    else if (dayEvents.length > 1) {
      const lngs = dayEvents.map((e) => e.lng);
      const lats = dayEvents.map((e) => e.lat);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 50, maxZoom: 16, duration: 600 });
    }
  }, [selected, dayEvents]);

  return (
    <section id="schedule" className="scroll-mt-24 space-y-4">
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-[11px] tracking-[0.3em] text-hl-400/60">
          <CalendarDays size={14} />
          ── SCHEDULE ──
        </p>
        <h2 className="font-display mt-1 bg-gradient-to-r from-hl-200 via-hl-400 to-hl-200 bg-clip-text text-2xl font-bold text-transparent">{t.shop.scheduleTitle}</h2>
      </div>

      <div className="rounded-2xl border border-line/20 bg-panel-900/60 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label={t.shop.calendarPrev} className="rounded-full p-1.5 text-tone-300 hover:text-main">
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-bold text-tone-100">{t.shop.calendarMonth(y, mo)}</p>
          <button type="button" onClick={() => shiftMonth(1)} aria-label={t.shop.calendarNext} className="rounded-full p-1.5 text-tone-300 hover:text-main">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-tone-500">
          {WEEKDAYS.map((w, i) => (
            <span key={w} className={i === 0 ? "text-rose-400/80" : i === 6 ? "text-sky-400/80" : ""}>
              {w}
            </span>
          ))}
          {cells.map((k, i) => {
            if (!k) return <span key={`b${i}`} />;
            const evs = byDay.get(k);
            const isToday = k === todayKey;
            const isSel = k === selected;
            const live = evs?.some((e) => Date.parse(e.startsAt) <= nowMs && Date.parse(e.endsAt) >= nowMs);
            return (
              <button
                key={k}
                type="button"
                disabled={!evs}
                onClick={() => setSelected(k)}
                className={`relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-sm transition ${
                  isSel ? "bg-hl-400 font-bold text-on-accent" : evs ? "text-tone-100 hover:bg-white/10" : "text-tone-600"
                } ${isToday && !isSel ? "ring-1 ring-hl-400/70" : ""}`}
                aria-label={t.shop.calendarDay(mo, Number(k.slice(8)), evs?.length ?? 0)}
              >
                {Number(k.slice(8))}
                {evs && <span className={`absolute bottom-0.5 h-1.5 w-1.5 rounded-full ${isSel ? "bg-on-accent" : live ? "animate-pulse bg-orange-400" : "bg-hl-400"}`} />}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={mapEl} className="h-44 w-full overflow-hidden rounded-2xl border border-line/20" />

      <div className="space-y-3">
        {dayEvents.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-main/20 px-4 py-6 text-center text-xs text-tone-500">{t.shop.scheduleEmpty}</p>
        ) : (
          dayEvents.map((e, i) => {
            const live = Date.parse(e.startsAt) <= nowMs && Date.parse(e.endsAt) >= nowMs;
            const d = new Date(Date.parse(e.startsAt) + 9 * 3600 * 1000);
            return (
              <div key={e.id} className="space-y-2 rounded-2xl border border-line/20 bg-panel-900/60 p-4">
                <p className="flex items-center gap-2 text-[11px] text-tone-400">
                  {dayEvents.length > 1 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[11px] font-extrabold text-black">{i + 1}</span>}
                  {t.shop.dateLabel(d.getUTCMonth() + 1, d.getUTCDate(), WEEKDAYS[d.getUTCDay()])}
                  {live && (
                    <span className="inline-flex items-center gap-1 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-extrabold text-black">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" /> OPEN
                    </span>
                  )}
                </p>
                <p className="flex items-start gap-2 text-base font-semibold leading-snug text-tone-100">
                  <MapPin size={16} className="mt-1 shrink-0 text-hl-400/80" />
                  {e.address ?? t.shop.spotPlaceFallback}
                </p>
                <p className="flex items-center gap-2 text-sm text-tone-300">
                  <Clock size={15} className="shrink-0 text-hl-400/80" />
                  {jstTime(e.startsAt)} 〜 {jstTime(e.endsAt)}
                </p>
                {e.note && <p className="whitespace-pre-wrap text-sm text-muted">{e.note}</p>}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-full border border-hl-400/50 px-4 py-2 text-sm font-semibold text-hl-200 transition hover:bg-hl-400/10"
                >
                  <Navigation size={15} />
                  {routeLabel}
                </a>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
