"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibreNs from "maplibre-gl";

// maplibre-glはCJS(UMD)なので、読み込み経路(サーバー描画を含む初期表示か、クリック後の遅延読み込みか)によって
// 名前空間に直接Mapが無く default の下にだけある場合がある。どちらでも使えるようにここで解決する。
const maplibregl: typeof maplibreNs = (maplibreNs as unknown as { default?: typeof maplibreNs }).default ?? maplibreNs;
import { Navigation, Play, Route as RouteIcon, X } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { photoResized, photoRouteUrl } from "@/components/photo/photoUtils";
import { useLocale } from "@/components/i18n/LocaleProvider";

// /map(VenueMapExplorer)と同じダーク地図・金色のピン・下のカードの見た目に揃えてある。
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const SOURCE_ID = "photo-spots";
const POINT_LAYER = "photo-spot-points";
const COUNT_LAYER = "photo-spot-count";
const GLOW_LAYER = "photo-spot-glow";
const CLUSTER_LAYER = "photo-spot-clusters";
const CLUSTER_COUNT_LAYER = "photo-spot-cluster-count";
const ROUTE_BG_LAYER = "photo-spot-route-bg";
const ROUTE_TEXT_LAYER = "photo-spot-route-text";
/** ピンのタップ判定の余裕(px)。ピンは小さく、指だと芯を外しやすいので周囲の一番近いピンを選ぶ。 */
const PIN_TAP_TOLERANCE_PX = 22;
/** 同じ場所とみなす距離(m)。この範囲だけを1つのピンにまとめる(それより離れた場所は、拡大すると別々のピンに分かれる)。 */
const MERGE_RADIUS_M = 10;
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

/** ルートの順番(0始まり)をA, B, C…の文字にする。 */
const routeLetter = (i: number) => String.fromCharCode(65 + (i % 26));

/** ルート選択中の場所には、地図のピンにも選んだ順の文字(A/B/C…)を出す。 */
function toFeatureCollection(spots: Spot[], route: string[] = []) {
  return {
    type: "FeatureCollection" as const,
    features: spots.map((s) => {
      const i = route.indexOf(s.id);
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
        properties: { id: s.id, count: s.posts.length, route: i >= 0 ? routeLetter(i) : "" },
      };
    }),
  };
}

/**
 * Googleマップの経路URL。選んだ順に、最初をA(出発)、最後を目的地、間を経由地にする。
 * 1か所だけなら現在地からの案内(目的地のみ)。目的地にGoogleの場所IDがあれば付ける。
 */
function routeUrlFor(spots: Spot[]): string {
  const pt = (sp: Spot) => `${sp.lat},${sp.lng}`;
  const last = spots[spots.length - 1];
  const params = new URLSearchParams({ api: "1", destination: pt(last) });
  const lastPlaceId = last.posts[0].post.placeId;
  if (lastPlaceId) params.set("destination_place_id", lastPlaceId);
  if (spots.length > 1) {
    params.set("origin", pt(spots[0]));
    if (spots.length > 2) params.set("waypoints", spots.slice(1, -1).map(pt).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function PhotoMap({
  posts,
  onOpenSpot,
}: {
  posts: PhotoPost[];
  onOpenSpot: (spotPosts: PhotoPost[], index: number, title: string) => void;
}) {
  const { t } = useLocale();
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
  // ルート作成: 選んだ場所を選んだ順(A→B→C…)に持つ。Googleマップの経路URLにして開く。
  const [route, setRoute] = useState<string[]>([]);
  const routeRef = useRef(route);
  routeRef.current = route;
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
      // ルート選択中は、サムネイルの左上に選んだ順の文字(A/B/C…)を出す。
      const routeBadge = document.createElement("span");
      routeBadge.setAttribute("data-route-badge", "");
      routeBadge.style.cssText =
        "position:absolute;left:-4px;top:-4px;min-width:20px;height:20px;border-radius:10px;background:#0b0b0d;border:2px solid #fbbf24;color:#fbbf24;font-size:11px;font-weight:700;line-height:16px;text-align:center;display:none;";
      el.appendChild(routeBadge);
      thumbRefs.current.set(spot.id, el);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([spot.lng, spot.lat]).addTo(map);
      thumbMarkers.push(marker);
    }
    const syncThumbs = () => {
      // いまクラスタ(数字の丸)にまとめられていない場所だけが、点・サムネイルとして見える。
      // ソースの準備前(初期表示)は全部を対象にする。
      let visibleIds: Set<string> | null = null;
      if (map.getSource(SOURCE_ID) && map.isSourceLoaded(SOURCE_ID)) {
        visibleIds = new Set(
          map
            .querySourceFeatures(SOURCE_ID, { filter: ["!", ["has", "point_count"]] })
            .map((f) => String(f.properties?.id)),
        );
      }
      const list = spotsRef.current.filter((sp) => !visibleIds || visibleIds.has(sp.id));
      const zoomedEnough = map.getZoom() >= THUMB_MIN_ZOOM;
      const pts = list.map((sp) => map.project([sp.lng, sp.lat]));
      const thumbIds: string[] = [];
      const shown = new Set<string>();
      list.forEach((sp, i) => {
        let isolated = zoomedEnough;
        for (let j = 0; isolated && j < list.length; j++) {
          if (j !== i && Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < THUMB_GAP_PX) isolated = false;
        }
        if (isolated) {
          thumbIds.push(sp.id);
          shown.add(sp.id);
        }
      });
      thumbRefs.current.forEach((el, id) => {
        el.style.display = shown.has(id) ? "block" : "none";
      });
      // サムネイルにした場所の金色の点は隠す(残りの点だけ描く)。クラスタは別のレイヤーで描く。
      const notCluster: maplibregl.FilterSpecification = ["!", ["has", "point_count"]];
      const notThumb: maplibregl.FilterSpecification = ["!", ["in", ["get", "id"], ["literal", thumbIds]]];
      if (map.getLayer(POINT_LAYER)) map.setFilter(POINT_LAYER, ["all", notCluster, notThumb]);
      const hasRoute: maplibregl.FilterSpecification = ["!=", ["get", "route"], ""];
      if (map.getLayer(ROUTE_BG_LAYER)) map.setFilter(ROUTE_BG_LAYER, ["all", notCluster, hasRoute, notThumb]);
      if (map.getLayer(ROUTE_TEXT_LAYER)) map.setFilter(ROUTE_TEXT_LAYER, ["all", notCluster, hasRoute, notThumb]);
      if (map.getLayer(COUNT_LAYER)) map.setFilter(COUNT_LAYER, ["all", notCluster, [">", ["get", "count"], 1], notThumb]);
    };
    map.on("zoom", syncThumbs);
    map.on("moveend", syncThumbs);
    map.on("sourcedata", (e) => {
      if (e.sourceId === SOURCE_ID && e.isSourceLoaded) syncThumbs();
    });
    syncThumbs();
    // 選択中の枠色は、描画後に反映する(activeIdRefは最新の選択を指す)。
    thumbRefs.current.forEach((el, id) => {
      el.style.borderColor = id === activeIdRef.current ? "#fbbf24" : "#fff";
      el.style.zIndex = id === activeIdRef.current ? "2" : "1";
    });

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: toFeatureCollection(spotsRef.current, routeRef.current),
        // 通常のマップ(/map)と同じ。密集した場所はまとめて数字の丸にし、拡大すると1か所ずつのピンに分かれる。
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 36,
      });

      map.addLayer({
        id: GLOW_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["get", "id"], activeIdRef.current ?? ""],
        paint: { "circle-color": "#fbbf24", "circle-radius": 24, "circle-blur": 0.9, "circle-opacity": 0.55 },
      });
      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#d4a537",
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 25, 30],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0b0b0d",
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#0b0b0d" },
      });
      map.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#d4a537",
          // 写真が多い場所ほど少し大きく(最大で+4px)。
          "circle-radius": ["+", 8, ["min", 4, ["-", ["get", "count"], 1]]],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0b0b0d",
        },
      });
      // ルートに選んだ場所は、黒地+金の縁の丸に文字(A/B/C…)を重ねる。
      map.addLayer({
        id: ROUTE_BG_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!=", ["get", "route"], ""],
        paint: { "circle-color": "#0b0b0d", "circle-radius": 13, "circle-stroke-width": 2, "circle-stroke-color": "#fbbf24" },
      });
      map.addLayer({
        id: ROUTE_TEXT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["!=", ["get", "route"], ""],
        layout: { "text-field": ["get", "route"], "text-font": ["Noto Sans Regular"], "text-size": 13, "text-allow-overlap": true },
        paint: { "text-color": "#fbbf24" },
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


      for (const layerId of [POINT_LAYER, CLUSTER_LAYER]) {
        map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
      }

      // タップ位置の周囲 PIN_TAP_TOLERANCE_PX 以内で一番近いピンを選ぶ。ピンが無ければクラスタ(数字の丸)を拡大して分解する。
      map.on("click", (e) => {
        const r = PIN_TAP_TOLERANCE_PX;
        const hits = map.queryRenderedFeatures(
          [
            [e.point.x - r, e.point.y - r],
            [e.point.x + r, e.point.y + r],
          ],
          { layers: [POINT_LAYER, CLUSTER_LAYER] },
        );
        if (hits.length === 0) return;
        const dist = (f: maplibregl.MapGeoJSONFeature) => {
          const c = (f.geometry as GeoJSON.Point).coordinates;
          const p = map.project([c[0], c[1]]);
          return Math.hypot(p.x - e.point.x, p.y - e.point.y);
        };
        const pin = hits
          .filter((f) => f.layer.id === POINT_LAYER)
          .sort((a, b) => dist(a) - dist(b))[0];
        if (pin) {
          focusSpot(String(pin.properties?.id));
          return;
        }
        const cluster = hits.find((f) => f.layer.id === CLUSTER_LAYER);
        const clusterId = cluster?.properties?.cluster_id;
        if (!cluster || clusterId === undefined || cluster.geometry.type !== "Point") return;
        const center = cluster.geometry.coordinates as [number, number];
        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err: Error | null | undefined, zoom: number | null | undefined) => {
          if (err) return;
          map.easeTo({ center, zoom: zoom ?? map.getZoom() + 2 });
        });
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

  // ルートの選択が変わったら、地図のピン(点・サムネイル)のA/B/C表示を更新する。
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(spotsRef.current, route));
    thumbRefs.current.forEach((el, id) => {
      const badge = el.querySelector<HTMLElement>("[data-route-badge]");
      if (!badge) return;
      const i = route.indexOf(id);
      badge.textContent = i >= 0 ? routeLetter(i) : "";
      badge.style.display = i >= 0 ? "block" : "none";
    });
  }, [route]);

  const toggleRoute = (id: string) =>
    setRoute((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
    const title = spot.names[0] + (spot.names.length > 1 ? t.photo.moreSpots(spot.names.length - 1) : "");
    onOpenSpot(spotPosts, Math.max(0, spotPosts.findIndex((p) => p.id === startPostId)), title);
  };

  if (spots.length === 0) {
    return <p className="px-2 py-10 text-center text-sm text-tone-500">{t.photo.empty}</p>;
  }

  return (
    <div className="relative" style={{ height: "calc(100dvh - 9.5rem)", minHeight: 480 }}>
      {/* maplibre-gl.cssが .maplibregl-map{position:relative} を後勝ちで当てるため、インラインで確実に勝たせる */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {route.length > 0 ? (
        <div className="pointer-events-auto absolute left-3 right-14 top-3 z-10 space-y-2 rounded-2xl border border-main/15 bg-black/80 p-2.5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-1.5">
            {route.map((id, i) => {
              const sp = spots.find((x) => x.id === id);
              if (!sp) return null;
              return (
                <span key={id} className="inline-flex max-w-[11rem] items-center gap-1 rounded-full border border-hl-400/50 bg-black px-2 py-1 text-[11px] text-main">
                  <b className="text-hl-300">{routeLetter(i)}</b>
                  <span className="truncate">{sp.names[0]}</span>
                  <button type="button" aria-label={t.photo.routeRemove} onClick={() => toggleRoute(id)} className="text-tone-500 hover:text-main">
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex gap-2">
            <a
              href={routeUrlFor(route.map((id) => spots.find((x) => x.id === id)).filter((x): x is Spot => Boolean(x)))}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-cta-light py-2 text-xs font-bold tracking-wide text-on-cta-gold transition hover:bg-cta-hover"
            >
              <Navigation size={14} />
              {t.photo.routeStart}
            </a>
            <button type="button" onClick={() => setRoute([])} className="rounded-full border border-main/15 px-3 py-2 text-xs text-tone-300 hover:text-main">
              {t.photo.routeClear}
            </button>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-3">
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className={`${CAROUSEL_HEIGHT} pointer-events-auto flex snap-x snap-mandatory gap-3 overflow-x-auto px-[9vw] sm:px-[calc(50%-10rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
          {spots.map((spot) => {
            const isActive = spot.id === activeId;
            const title = spot.names[0] + (spot.names.length > 1 ? t.photo.moreSpots(spot.names.length - 1) : "");
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
                        {post.videoUrl ? (
                          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white" aria-label={t.photo.badgeVideo}>
                            <Play size={12} className="fill-white" />
                          </span>
                        ) : null}
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
                      {t.photo.count(spot.posts.length)} ←→
                    </span>
                  ) : null}
                </div>
                <div className="shrink-0 space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-display text-sm font-bold text-main">{title}</p>
                    {spot.kind === "listed" || spot.kind === "spot" ? (
                      <span className="rounded-full border border-tone-600 px-2 py-0.5 text-[10px] text-tone-300">
                        {spot.kind === "listed" ? t.photo.badgeListed : t.photo.badgeSpot}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRoute(spot.id);
                      }}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition ${
                        route.includes(spot.id) ? "border-hl-400 text-hl-300" : "border-main/20 text-tone-300 hover:text-main"
                      }`}
                    >
                      <RouteIcon size={11} />
                      {route.includes(spot.id) ? t.photo.routeLabel(routeLetter(route.indexOf(spot.id))) : t.photo.routeAdd}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={photoRouteUrl(spot.posts[0].post)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 rounded-full bg-cta-light py-2 text-center text-xs font-bold tracking-wide text-on-cta-gold transition hover:bg-cta-hover"
                    >
                      {t.photo.directionsArrow}
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSpot(spot, spot.posts[0].post.id);
                      }}
                      className="rounded-full border border-main/15 px-3 py-2 text-xs text-tone-300 transition hover:border-hl-400/50 hover:text-hl-300"
                    >
                      {t.photo.viewPhotos}
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
