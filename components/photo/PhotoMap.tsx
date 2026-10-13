"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibreNs from "maplibre-gl";

// maplibre-glはCJS(UMD)なので、読み込み経路(サーバー描画を含む初期表示か、クリック後の遅延読み込みか)によって
// 名前空間に直接Mapが無く default の下にだけある場合がある。どちらでも使えるようにここで解決する。
const maplibregl: typeof maplibreNs = (maplibreNs as unknown as { default?: typeof maplibreNs }).default ?? maplibreNs;
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { photoResized, photoRouteUrl } from "@/components/photo/photoUtils";

// /map(VenueMapExplorer)と同じダーク地図・金色のピン・下のカードの見た目に揃えてある。
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const SOURCE_ID = "photo-spots";
const POINT_LAYER = "photo-spot-points";
const COUNT_LAYER = "photo-spot-count";
const GLOW_LAYER = "photo-spot-glow";
/** ピンのタップ判定の余裕(px)。ピンは小さく、指だと芯を外しやすいので周囲の一番近いピンを選ぶ。 */
const PIN_TAP_TOLERANCE_PX = 22;
/** 近接とみなす距離(m)。この範囲の場所は1つのカード(ピン)にまとめる。 */
const MERGE_RADIUS_M = 30;
const MAX_SPOTS = 60;
/**
 * 金色の点から丸いサムネイルへの切り替え。固定のズームではなく、点が「ばらけた」段階で場所ごとに切り替える:
 * 画面上で他の場所から THUMB_GAP_PX(金色の点どうしが重ならなくなる距離)以上離れた場所はサムネイルに、重なる場所は点のまま。
 * 引きの全体表示でサムネイルだらけにならないよう、THUMB_MIN_ZOOM 未満では必ず点にする。
 */
const THUMB_MIN_ZOOM = 12;
const THUMB_GAP_PX = 20;
/** カードの高さ。可変にすると地図の高さが動いて再描画ループになるため固定。 */
const CAROUSEL_HEIGHT = "h-[34dvh] min-h-[220px] max-h-[300px]";

type Spot = {
  id: string;
  lat: number;
  lng: number;
  posts: { post: PhotoPost; index: number }[];
  /** まとめられた店・場所の名前(投稿の多い順、重複なし)。 */
  names: string[];
  kind: PhotoPost["placeKind"];
  latest: string;
};

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function placeKey(post: PhotoPost) {
  return post.venueId
    ? `v:${post.venueId}`
    : post.placeId
      ? `g:${post.placeId}`
      : `c:${post.latitude.toFixed(4)},${post.longitude.toFixed(4)}`;
}

/**
 * 同じ店・場所(venue_id/place_id、手入力は座標約10m)でまず束ね、さらに MERGE_RADIUS_M 以内の
 * 場所どうしを1つにまとめる。まとまった場所は1つのピン・1枚のカードになり、写真はカード内で横にスワイプできる。
 */
function buildSpots(posts: PhotoPost[]): Spot[] {
  const places = new Map<string, { lat: number; lng: number; name: string; kind: PhotoPost["placeKind"]; items: { post: PhotoPost; index: number }[] }>();
  posts.forEach((post, index) => {
    const key = placeKey(post);
    const p = places.get(key);
    if (p) p.items.push({ post, index });
    else
      places.set(key, {
        lat: post.latitude,
        lng: post.longitude,
        name: post.placeName || post.spotName,
        kind: post.placeKind,
        items: [{ post, index }],
      });
  });

  const spots: Spot[] = [];
  const sorted = Array.from(places.values()).sort((a, b) => b.items.length - a.items.length);
  for (const place of sorted) {
    const near = spots.find((s) => distanceM(s.lat, s.lng, place.lat, place.lng) <= MERGE_RADIUS_M);
    if (near) {
      near.posts.push(...place.items);
      if (!near.names.includes(place.name)) near.names.push(place.name);
    } else {
      spots.push({
        id: `s${spots.length}`,
        lat: place.lat,
        lng: place.lng,
        posts: [...place.items],
        names: [place.name],
        kind: place.kind,
        latest: "",
      });
    }
  }
  for (const s of spots) {
    s.posts.sort((a, b) => b.post.createdAt.localeCompare(a.post.createdAt));
    s.latest = s.posts[0].post.createdAt;
  }
  return spots.sort((a, b) => b.latest.localeCompare(a.latest)).slice(0, MAX_SPOTS);
}

function toFeatureCollection(spots: Spot[]) {
  return {
    type: "FeatureCollection" as const,
    features: spots.map((s) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      properties: { id: s.id, count: s.posts.length },
    })),
  };
}

export function PhotoMap({
  posts,
  onOpenSpot,
}: {
  posts: PhotoPost[];
  onOpenSpot: (spotPosts: PhotoPost[], index: number, title: string) => void;
}) {
  const spots = useMemo(() => buildSpots(posts), [posts]);
  const spotsRef = useRef(spots);
  spotsRef.current = spots;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  // 拡大時に出す丸いサムネイル(DOMマーカー)。選択中のものだけ枠を金色にする。
  const thumbRefs = useRef(new Map<string, HTMLDivElement>());
  const [activeId, setActiveId] = useState<string | null>(spots[0]?.id ?? null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  // カードのスクロール位置から選択を決めるとき、プログラムによるスクロールを無視するためのフラグ。
  const programmaticScroll = useRef(false);

  const focusSpot = useCallback((id: string, opts: { fly?: boolean } = { fly: true }) => {
    const spot = spotsRef.current.find((s) => s.id === id);
    if (!spot) return;
    setActiveId(id);
    const card = cardRefs.current.get(id);
    const carousel = carouselRef.current;
    if (card && carousel) {
      programmaticScroll.current = true;
      carousel.scrollTo({ left: card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2, behavior: "smooth" });
      window.setTimeout(() => (programmaticScroll.current = false), 500);
    }
    if (opts.fly) {
      // カードに隠れない位置(地図の上寄り)へ寄せる。
      mapRef.current?.easeTo({ center: [spot.lng, spot.lat], duration: 400 });
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || spots.length === 0) return;

    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE_URL,
      center: [spots[0].lng, spots[0].lat],
      zoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    const thumbMarkers: maplibregl.Marker[] = [];


    // 拡大して位置が確定して見える段階(THUMB_MIN_ZOOM以上)では、点の代わりに最新写真の丸いサムネイルを出す。
    // マーカー要素にpositionは指定しない(maplibreが位置決めに使うため、上書きするとピンがずれる)。
    thumbRefs.current.clear();
    for (const spot of spotsRef.current) {
      const el = document.createElement("div");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", spot.names[0]);
      el.style.cssText =
        "width:46px;height:46px;border-radius:50%;border:2.5px solid #fff;box-sizing:border-box;cursor:pointer;" +
        "box-shadow:0 2px 10px rgba(0,0,0,.6);background:#222 center/cover no-repeat;display:none;" +
        `background-image:url("${photoResized(spot.posts[0].post.imageUrl, 120, true)}")`;
      if (spot.posts.length > 1) {
        const badge = document.createElement("span");
        badge.textContent = String(spot.posts.length);
        badge.style.cssText =
          "position:absolute;right:-4px;bottom:-4px;min-width:18px;height:18px;border-radius:9px;background:#d4a537;color:#0b0b0d;font-size:11px;font-weight:700;line-height:18px;text-align:center;padding:0 4px;box-shadow:0 1px 4px rgba(0,0,0,.5);";
        el.appendChild(badge);
      }
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        focusSpot(spot.id);
      });
      thumbRefs.current.set(spot.id, el);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([spot.lng, spot.lat]).addTo(map);
      thumbMarkers.push(marker);
    }
    const syncThumbs = () => {
      const list = spotsRef.current;
      const zoomedEnough = map.getZoom() >= THUMB_MIN_ZOOM;
      const pts = list.map((sp) => map.project([sp.lng, sp.lat]));
      const thumbIds: string[] = [];
      list.forEach((sp, i) => {
        let isolated = zoomedEnough;
        for (let j = 0; isolated && j < list.length; j++) {
          if (j !== i && Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < THUMB_GAP_PX) isolated = false;
        }
        const el = thumbRefs.current.get(sp.id);
        if (el) el.style.display = isolated ? "block" : "none";
        if (isolated) thumbIds.push(sp.id);
      });
      // サムネイルにした場所の金色の点は隠す(残りの点だけ描く)。
      const notThumb: maplibregl.FilterSpecification = ["!", ["in", ["get", "id"], ["literal", thumbIds]]];
      if (map.getLayer(POINT_LAYER)) map.setFilter(POINT_LAYER, notThumb);
      if (map.getLayer(COUNT_LAYER)) map.setFilter(COUNT_LAYER, ["all", [">", ["get", "count"], 1], notThumb]);
    };
    map.on("zoom", syncThumbs);
    syncThumbs();
    // 選択中の枠色は、描画後に反映する(activeIdRefは最新の選択を指す)。
    thumbRefs.current.forEach((el, id) => {
      el.style.borderColor = id === activeIdRef.current ? "#fbbf24" : "#fff";
      el.style.zIndex = id === activeIdRef.current ? "2" : "1";
    });

    map.on("load", () => {
      map.addSource(SOURCE_ID, { type: "geojson", data: toFeatureCollection(spotsRef.current) });

      map.addLayer({
        id: GLOW_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["get", "id"], activeIdRef.current ?? ""],
        paint: { "circle-color": "#fbbf24", "circle-radius": 24, "circle-blur": 0.9, "circle-opacity": 0.55 },
      });
      map.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-color": "#d4a537",
          // 写真が多い場所ほど少し大きく(最大で+4px)。
          "circle-radius": ["+", 8, ["min", 4, ["-", ["get", "count"], 1]]],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0b0b0d",
        },
      });
      map.addLayer({
        id: COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: [">", ["get", "count"], 1],
        layout: {
          "text-field": ["to-string", ["get", "count"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#0b0b0d" },
      });


      map.on("mouseenter", POINT_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", POINT_LAYER, () => (map.getCanvas().style.cursor = ""));

      // タップ位置の周囲 PIN_TAP_TOLERANCE_PX 以内で一番近いピンを選ぶ。
      map.on("click", (e) => {
        const r = PIN_TAP_TOLERANCE_PX;
        const hits = map.queryRenderedFeatures(
          [
            [e.point.x - r, e.point.y - r],
            [e.point.x + r, e.point.y + r],
          ],
          { layers: [POINT_LAYER] },
        );
        if (hits.length === 0) return;
        let best = hits[0];
        let bestD = Infinity;
        for (const f of hits) {
          const c = (f.geometry as GeoJSON.Point).coordinates;
          const p = map.project([c[0], c[1]]);
          const d = Math.hypot(p.x - e.point.x, p.y - e.point.y);
          if (d < bestD) {
            bestD = d;
            best = f;
          }
        }
        focusSpot(String(best.properties?.id));
      });

      // 全ピンが入る範囲に合わせる(下はカードに隠れない余白)。1か所だけなら寄せすぎない。
      const list = spotsRef.current;
      if (list.length > 1) {
        const bounds = new maplibregl.LngLatBounds([list[0].lng, list[0].lat], [list[0].lng, list[0].lat]);
        list.forEach((s) => bounds.extend([s.lng, s.lat]));
        map.fitBounds(bounds, { padding: { top: 70, bottom: 300, left: 50, right: 50 }, maxZoom: 15, duration: 0 });
      } else {
        map.setCenter([list[0].lng, list[0].lat]);
        map.setZoom(15);
      }
      syncThumbs();
    });

    return () => {
      ro.disconnect();
      thumbMarkers.forEach((m) => m.remove());
      thumbRefs.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [spots, focusSpot]);

  // 選択中のピンだけ光らせる。
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.getLayer(GLOW_LAYER)) map.setFilter(GLOW_LAYER, ["==", ["get", "id"], activeId ?? ""]);
    thumbRefs.current.forEach((el, id) => {
      el.style.borderColor = id === activeId ? "#fbbf24" : "#fff";
      el.style.zIndex = id === activeId ? "2" : "1";
    });
  }, [activeId]);

  // カードをスワイプして中央に来たものを選択状態にし、地図もその場所へ寄せる。
  const scrollTimer = useRef<number | undefined>(undefined);
  const handleCarouselScroll = () => {
    if (programmaticScroll.current) return;
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const carousel = carouselRef.current;
      if (!carousel) return;
      const center = carousel.scrollLeft + carousel.clientWidth / 2;
      let bestId: string | null = null;
      let bestD = Infinity;
      cardRefs.current.forEach((el, id) => {
        const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - center);
        if (d < bestD) {
          bestD = d;
          bestId = id;
        }
      });
      if (bestId && bestId !== activeIdRef.current) focusSpot(bestId);
    }, 120);
  };

  // そのカード(同じ場所にまとまった写真)だけをビューアに渡す。
  const openSpot = (spot: Spot, startPostId: string) => {
    const spotPosts = spot.posts.map((p) => p.post);
    const title = spot.names[0] + (spot.names.length > 1 ? ` ほか${spot.names.length - 1}か所` : "");
    onOpenSpot(spotPosts, Math.max(0, spotPosts.findIndex((p) => p.id === startPostId)), title);
  };

  if (spots.length === 0) {
    return <p className="px-2 py-10 text-center text-sm text-tone-500">まだ投稿がありません。</p>;
  }

  return (
    <div className="relative" style={{ height: "calc(100dvh - 9.5rem)", minHeight: 480 }}>
      {/* maplibre-gl.cssが .maplibregl-map{position:relative} を後勝ちで当てるため、インラインで確実に勝たせる */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-3">
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className={`${CAROUSEL_HEIGHT} pointer-events-auto flex snap-x snap-mandatory gap-3 overflow-x-auto px-[9vw] sm:px-[calc(50%-10rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
          {spots.map((spot) => {
            const isActive = spot.id === activeId;
            const title = spot.names[0] + (spot.names.length > 1 ? ` ほか${spot.names.length - 1}か所` : "");
            return (
              <div
                key={spot.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(spot.id, el);
                  else cardRefs.current.delete(spot.id);
                }}
                onClick={() => focusSpot(spot.id)}
                className={`flex h-full w-[82vw] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border bg-panel-950 shadow-xl transition-[transform,opacity,border-color,box-shadow] duration-300 ease-out sm:w-80 ${
                  isActive
                    ? "scale-100 border-hl-400/70 opacity-100 shadow-hl-500/20"
                    : "scale-[0.94] border-main/10 opacity-60"
                }`}
              >
                {/* 写真はカード内で横にスワイプ。重なった場所の写真もここにまとまる。 */}
                <div className="relative min-h-0 w-full flex-1 bg-surface">
                  <div className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {spot.posts.map(({ post, index }) => (
                      <button
                        key={post.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isActive) openSpot(spot, post.id);
                          else focusSpot(spot.id);
                        }}
                        className="relative h-full w-full shrink-0 snap-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoResized(post.imageUrl, 640, true)}
                          alt={post.spotName}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        {spot.names.length > 1 ? (
                          <span className="absolute bottom-2 left-2 max-w-[70%] truncate rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-main">
                            {post.placeName || post.spotName}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  {spot.posts.length > 1 ? (
                    <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold tracking-wide text-main backdrop-blur">
                      {spot.posts.length}枚 ←→
                    </span>
                  ) : null}
                </div>
                <div className="shrink-0 space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-display text-sm font-bold text-main">{title}</p>
                    {spot.kind === "listed" || spot.kind === "spot" ? (
                      <span className="rounded-full border border-tone-600 px-2 py-0.5 text-[10px] text-tone-300">
                        {spot.kind === "listed" ? "掲載店" : "穴場"}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={photoRouteUrl(spot.posts[0].post)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 rounded-full bg-cta-light py-2 text-center text-xs font-bold tracking-wide text-on-cta-gold transition hover:bg-cta-hover"
                    >
                      ルート案内 →
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSpot(spot, spot.posts[0].post.id);
                      }}
                      className="rounded-full border border-main/15 px-3 py-2 text-xs text-tone-300 transition hover:border-hl-400/50 hover:text-hl-300"
                    >
                      写真を見る
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
