"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import { MapReelOverlay, type CardRect } from "@/components/map/MapReelOverlay";
import { CheckCircle2, Globe2, Navigation, Play, Search, X } from "lucide-react";
import { AFTER_GENRE } from "@/lib/shop/genres";
import { genreLabel } from "@/lib/i18n/genreLabels";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { geocode } from "@/lib/map/geocode";
import { estimateTimeFromDistance } from "@/lib/map/estimateTime";
import { OPEN_SEARCH_EVENT } from "@/lib/reels/events";
import type { NightlifeGenre, VenueCardData, VenuePin } from "@/types/venue";
import { StreamVideo } from "@/components/video/StreamVideo";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const SOURCE_ID = "venues";
const CLUSTER_LAYER = "venue-clusters";
const CLUSTER_COUNT_LAYER = "venue-cluster-count";
const POINT_LAYER = "venue-points";
const SPONSORED_LAYER = "venue-sponsored-points";
/** 選択中のピンの下に敷く光。どのピンがカードと対応しているかを一目で分かるようにする。 */
const ACTIVE_GLOW_LAYER = "venue-active-glow";
/** ピンの大きさ・光の変化にかける時間(ms)。maplibreのpaint transitionで補間させる。 */
const PIN_TRANSITION = { duration: 280, delay: 0 };
/**
 * ピンのタップ判定の余裕(px)。ピンは直径16px前後と小さく、指だと芯を外しやすい
 * (外すとピンチで拡大してから押し直すことになる)ので、周囲この範囲内の一番近いピンを選ぶ。
 */
const PIN_TAP_TOLERANCE_PX = 22;
/** ピンが「画面内に見えている」とみなす余白(px)。上は検索バー+ジャンルピルぶん広めに取る。 */
const REVEAL_MARGIN_PX = 48;
const REVEAL_TOP_PX = 120;

function toFeatureCollection(pins: VenuePin[]) {
  return {
    type: "FeatureCollection" as const,
    features: pins.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: { id: p.id, sponsored: p.isSponsored ? 1 : 0 },
    })),
  };
}

/**
 * カルーセルの高さ。中身によらず常に一定にするための固定値
 * (可変にすると地図の高さが動いて再描画ループになる。上の説明を参照)。
 */
const CAROUSEL_HEIGHT = "h-[38dvh] min-h-[230px] max-h-[330px]";

/** 表示範囲内に何件あってもカルーセルに積むのはこの件数まで(中心に近い順に採用)。 */
const MAX_CARDS = 30;

/** 地図を動かしてから取得するまでの待ち時間(ms)。ドラッグ中の連打を防ぐ。 */
const FETCH_DEBOUNCE_MS = 400;
/** 初回(現在地)の取得半径(m)。 */
const INITIAL_RADIUS_M = 500;
/** これより広い範囲は取得しない(APIも同じ上限で400を返す)。ズームを促す。 */
const MAX_BBOX_SPAN_DEG = 5;

export function VenueMapExplorer({
  initialCenter,
  initialBounds,
  autoLocate = false,
  genres = [],
}: {
  /** 指定エリアのマップとして開くときの初期中心。 */
  initialCenter?: { lat: number; lng: number };
  /**
   * 指定エリアの店舗が全部収まる範囲。中心固定だと、店舗が数kmに散らばるエリア
   * (横浜など)で初期表示に1件も入らないことがあるため、範囲が来たらそちらを優先する。
   */
  initialBounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  /** 開いた直後に現在地へ寄せる(エリア指定なしのマップ入口用)。 */
  autoLocate?: boolean;
  /** ジャンル絞り込みピルの選択肢(ALL以外)。掲載中店舗の実カテゴリをサーバー側で集計して渡す。 */
  genres?: string[];
}) {
  const genrePills = useMemo<{ value: NightlifeGenre; label: string }[]>(
    () => [{ value: "all", label: "ALL" }, ...genres.map((g) => ({ value: g, label: g }))],
    [genres],
  );
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const suppressScrollSync = useRef(false);
  // カード操作で地図を動かしたときは、その moveend で取り直さない
  // (取り直すと今スワイプしているカードの並びが変わって操作が奪われる)。
  const programmaticMove = useRef(false);
  const fetchTimer = useRef<number | null>(null);
  const fetchAbort = useRef<AbortController | null>(null);
  // 直前に取得した問い合わせ文字列。fitBoundsやresizeが余分なmoveendを出すので、
  // 同じ範囲での取得はここで弾く(フラグ1個だと別のmoveendに消費されて素通りする)。
  const lastQuery = useRef<string | null>(null);
  // アフタータグ選択中か。アフター(深夜飲食店)は通常のマップに出さず、タグを押したときだけ
  // サーバーから別に取り直す(after=1)。取得系のコールバックから参照するのでrefで持つ。
  const afterMode = useRef(false);
  // 地図のクリックハンドラは初期化時に1回だけ登録するので、そこから最新のfocusVenueを呼べるようrefで持つ。
  // (直接呼ぶと初回レンダー時のfocusVenue=カード0件の状態を掴んだままになり、どのピンを押しても
  //  「カード未取得のピン」扱いで地図がズーム移動して取り直しになっていた)
  const focusVenueRef = useRef<(id: string, opts?: { fromMap?: boolean }) => void>(() => {});
  // カード未取得のピンをタップして周辺を取り直したとき、取り直し後にそのカードを中央へ寄せるための目印。
  const pendingCenterId = useRef<string | null>(null);

  const { t, locale } = useLocale();
  const router = useRouter();
  // 全画面リールを開いている店舗(開いた起点)。nullなら閉じている。
  const [reelOverlayVenueId, setReelOverlayVenueId] = useState<string | null>(null);
  const [genre, setGenre] = useState<NightlifeGenre>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<"idle" | "searching" | "notFound">("idle");
  // 表示範囲ぶんだけをサーバーから受け取る。全国分は決して保持しない。
  const [pins, setPins] = useState<VenuePin[]>([]);
  const [cards, setCards] = useState<VenueCardData[]>([]);
  const [tooWide, setTooWide] = useState(false);
  const [loading, setLoading] = useState(true);
  // 所要時間表示用。有料APIは叩かず、取得済みの現在地から直線距離で概算するだけなので
  // ここに保持しておけば全カードぶん使い回せる。
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

  const filteredPins = useMemo(
    () => (genre === "all" ? pins : pins.filter((p) => p.genre === genre)),
    [pins, genre],
  );

  const visibleVenues = useMemo(
    () => (genre === "all" ? cards : cards.filter((v) => v.genre === genre)),
    [cards, genre],
  );

  const venueById = useMemo(() => new Map(cards.map((v) => [v.id, v])), [cards]);

  /**
   * 指定したカードをカルーセルのちょうど中央にスクロールする。
   * scrollIntoView(inline:"center")はscroll-snapと組み合わせると端のカードで中央に来ないことがあるため、
   * 位置を自前で計算してscrollToする(両端に余白を入れてあるので、最初・最後のカードも中央に来る)。
   */
  const centerCard = useCallback((id: string, behavior: ScrollBehavior = "smooth") => {
    const card = cardRefs.current.get(id);
    const carousel = carouselRef.current;
    if (!card || !carousel) return;
    suppressScrollSync.current = true;
    carousel.scrollTo({
      left: card.offsetLeft - (carousel.clientWidth - card.offsetWidth) / 2,
      behavior,
    });
    window.setTimeout(() => (suppressScrollSync.current = false), behavior === "smooth" ? 500 : 300);
  }, []);

  /**
   * ピンが画面内に見えていないときだけ、地図をそこへ寄せる(ズームは変えない)。
   * 見えているのに毎回中央へ動かすと、タップしたピンが指の下から逃げて違和感がある。
   */
  const revealOnMap = useCallback((lng: number, lat: number, duration = 400) => {
    const map = mapRef.current;
    if (!map) return;
    const p = map.project([lng, lat]);
    const el = map.getContainer();
    const inView =
      p.x >= REVEAL_MARGIN_PX &&
      p.x <= el.clientWidth - REVEAL_MARGIN_PX &&
      p.y >= REVEAL_TOP_PX &&
      p.y <= el.clientHeight - REVEAL_MARGIN_PX;
    if (inView) return;
    // 自分で動かした分のmoveendで取り直さないように(動かさないときは立てない。立てたままだと次のドラッグを取りこぼす)。
    programmaticMove.current = true;
    map.easeTo({ center: [lng, lat], duration });
  }, []);

  const buildingMates = useCallback(
    (venue: VenueCardData) => {
      if (!venue.location.buildingName) return [];
      return cards.filter(
        (v) => v.id !== venue.id && v.location.buildingName === venue.location.buildingName,
      );
    },
    [cards],
  );

  /**
   * 今見えている範囲(またはGPS中心の半径)のぶんだけ取得する。
   * ピン(軽量)とカード(動画・キャスト付き、最大30件)を別エンドポイントに分けており、
   * 広域ズーム時に重いカードデータを引かないようにしている。
   */
  const fetchForQuery = useCallback(async (baseQuery: string) => {
    const queryString = afterMode.current ? `${baseQuery}&after=1` : baseQuery;
    if (lastQuery.current === queryString) return;
    lastQuery.current = queryString;
    fetchAbort.current?.abort();
    const controller = new AbortController();
    fetchAbort.current = controller;
    setLoading(true);
    try {
      const [pinsRes, cardsRes] = await Promise.all([
        fetch(`/api/venues/pins?${queryString}`, { signal: controller.signal }),
        fetch(`/api/venues?${queryString}`, { signal: controller.signal }),
      ]);
      if (!pinsRes.ok || !cardsRes.ok) return;
      const pinsJson = (await pinsRes.json()) as { pins: VenuePin[] };
      const cardsJson = (await cardsRes.json()) as { venues: VenueCardData[] };
      setPins(pinsJson.pins ?? []);
      setCards(cardsJson.venues ?? []);
    } catch {
      // 連続スワイプでのabortは正常系なので無視する。
    } finally {
      // 中断された取得(新しい取得に置き換わった場合)はローディング表示を消さない。
      if (fetchAbort.current === controller) setLoading(false);
    }
  }, []);

  /** 地図の現在の表示範囲で取得する。広すぎるときは取得せずズームを促す。 */
  const fetchForCurrentView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const spanLat = b.getNorth() - b.getSouth();
    const spanLng = b.getEast() - b.getWest();
    if (spanLat > MAX_BBOX_SPAN_DEG || spanLng > MAX_BBOX_SPAN_DEG) {
      setTooWide(true);
      setPins([]);
      setCards([]);
      setLoading(false);
      return;
    }
    setTooWide(false);
    // 小数以下を丸めて、わずかな移動では取り直さないようにする(約10m単位)。
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      .map((v) => v.toFixed(4))
      .join(",");
    void fetchForQuery(`bbox=${bbox}&limit=${MAX_CARDS}`);
  }, [fetchForQuery]);

  /** ドラッグ中にAPIを連打しないための遅延実行。 */
  const scheduleFetch = useCallback(() => {
    if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
    fetchTimer.current = window.setTimeout(fetchForCurrentView, FETCH_DEBOUNCE_MS);
  }, [fetchForCurrentView]);

  // 地図の初期化(1回だけ)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    // 初期中心。現在地は取得後にflyToで寄せるので、ここは東京駅を仮置きする。
    const center: [number, number] = initialCenter
      ? [initialCenter.lng, initialCenter.lat]
      : [139.7671, 35.6812];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      // OpenFreeMapのdarkスタイル。APIキー不要・リクエスト数制限なしで、
      // 背景がほぼ黒(rgb(12,12,12))のナイトモード地図をズーム19相当まで使える
      // (CARTOの無料タイルはAPIキー必須化、Esriの無償ダークタイルはズーム16以上で
      //  "Map data not yet available"になるため、どちらも不採用)。
      style: MAP_STYLE_URL,
      center,
      zoom: 15,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), "top-right");

    // flex-1コンテナが確定サイズを持つ前にmaplibreが0x0で初期化してしまうことがあるため、
    // 実際のコンテナサイズ変化を監視して明示的にresize()する(ResizeObserverの自動追従だけでは
    // 初回タイミングによって追従しないケースがあった)。
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: toFeatureCollection([]),
        cluster: true,
        // 繁華街では店舗が密集しているため、まとめる範囲を狭く・早いズームで解除して、
        // ピンチしなくても通常の表示倍率(15〜16)で1店舗ずつタップできるようにする。
        clusterMaxZoom: 14,
        clusterRadius: 36,
        clusterProperties: {
          hasSponsored: ["max", ["get", "sponsored"]],
        },
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["case", [">", ["get", "hasSponsored"], 0], "#a855f7", "#d4a537"],
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
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Noto Sans Regular"],
        },
        paint: { "text-color": "#0b0b0d" },
      });

      map.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "sponsored"], 0]],
        paint: {
          "circle-color": "#d4a537",
          "circle-radius": 8,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0b0b0d",
        },
      });

      map.addLayer({
        id: SPONSORED_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "sponsored"], 1]],
        paint: {
          "circle-color": "#a855f7",
          "circle-radius": 12,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#f3e8ff",
        },
      });

      // 選択中のピンの下に敷く光。ピンのレイヤーより下に入れる。
      map.addLayer(
        {
          id: ACTIVE_GLOW_LAYER,
          type: "circle",
          source: SOURCE_ID,
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-color": "#fbbf24",
            "circle-radius": 24,
            "circle-blur": 0.9,
            "circle-opacity": 0.55,
          },
        },
        POINT_LAYER,
      );

      // 大きさの変化を補間させる(選択時にポンと弾むように見せる)。
      // maplibre v3の型定義はaddLayerのpaintに *-transition を受け付けないので、追加後に設定する。
      for (const layerId of [POINT_LAYER, SPONSORED_LAYER, ACTIVE_GLOW_LAYER]) {
        map.setPaintProperty(layerId, "circle-radius-transition", PIN_TRANSITION);
      }

      for (const layerId of [POINT_LAYER, SPONSORED_LAYER, CLUSTER_LAYER]) {
        map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
      }

      // ピン・クラスタのタップはここで一括して判定する。
      // タップ位置の周囲 PIN_TAP_TOLERANCE_PX 以内のピンから一番近いものを選び、無ければクラスタを拡大する。
      map.on("click", (e: maplibregl.MapMouseEvent) => {
        const { x, y } = e.point;
        const tol = PIN_TAP_TOLERANCE_PX;
        const hits = map.queryRenderedFeatures(
          [
            [x - tol, y - tol],
            [x + tol, y + tol],
          ],
          { layers: [SPONSORED_LAYER, POINT_LAYER, CLUSTER_LAYER] },
        );
        const distanceFromTap = (f: maplibregl.MapGeoJSONFeature) => {
          if (f.geometry.type !== "Point") return Infinity;
          const p = map.project(f.geometry.coordinates as [number, number]);
          return Math.hypot(p.x - x, p.y - y);
        };

        const nearestPin = hits
          .filter((f) => f.layer.id !== CLUSTER_LAYER)
          .sort((a, b) => distanceFromTap(a) - distanceFromTap(b))[0];
        const pinId = nearestPin?.properties?.id as string | undefined;
        if (pinId) {
          focusVenueRef.current(pinId, { fromMap: true });
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

      if (initialBounds) {
        programmaticMove.current = true;
        map.fitBounds(
          new maplibregl.LngLatBounds(
            [initialBounds.minLng, initialBounds.minLat],
            [initialBounds.maxLng, initialBounds.maxLat],
          ),
          { padding: 48, maxZoom: 16, duration: 0 },
        );
      }

      setMapReady(true);
    });

    // 地図を動かすたびに、今映っている範囲のぶんだけ取り直す
    // (エリアを選ばせる代わりに、見ている範囲がそのまま検索条件になる)。
    map.on("moveend", () => {
      if (programmaticMove.current) {
        programmaticMove.current = false;
        return;
      }
      scheduleFetch();
    });

    mapRef.current = map;
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 「まず現在位置」。開いた直後に自分のいる場所へ寄せ、その半径500mぶんだけ取得する。
  //
  // ここは地図の読み込み完了(mapReady)を待たないこと。maplibreのloadイベントは
  // スタイルと初期タイルが揃うまで発火せず、待つと店舗の取得開始が10秒以上遅れる
  // (実測で11.9秒)。カードは地図と独立して出せるので、マウント直後に取りに行く。
  useEffect(() => {
    if (!autoLocate || !navigator.geolocation) {
      // エリア指定で開いたときは、サーバーが渡してきた範囲でそのまま取得する
      // (地図インスタンスを参照しないので、タイルの読み込みと並行して走る)。
      if (initialBounds) {
        const bbox = [
          initialBounds.minLng,
          initialBounds.minLat,
          initialBounds.maxLng,
          initialBounds.maxLat,
        ].join(",");
        void fetchForQuery(`bbox=${bbox}&limit=${MAX_CARDS}`);
      }
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        void fetchForQuery(
          `lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&radius=${INITIAL_RADIUS_M}&limit=${MAX_CARDS}`,
        );
        const map = mapRef.current;
        if (!map) return;
        programmaticMove.current = true;
        map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16, speed: 1.4 });
      },
      () => {
        if (!cancelled) fetchForCurrentView();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タイマー・通信の後始末
  useEffect(() => {
    return () => {
      if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
      fetchAbort.current?.abort();
    };
  }, []);


  const goToMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 15,
          speed: 1.4,
        });
      },
      () => {
        /* 拒否されたら今の表示のままにする */
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  /**
   * 検索は「掲載店舗を探す」→ 見つからなければ「住所として解決する」の順。
   *
   * 先に外部ジオコーダに投げると、地名が全国にあるせいで掲載の無い場所へ飛ぶ
   * (「渋谷」で地方の渋谷、「東京」で札幌市東区)。店舗が無い場所に飛んでも
   * 意味がないので、自分のデータに該当があればそこを最優先する。
   */
  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      setSearchState("searching");

      const map = mapRef.current;
      const center = map?.getCenter();
      try {
        const params = new URLSearchParams({ q });
        if (afterMode.current) params.set("after", "1");
        if (center) {
          params.set("lat", String(center.lat));
          params.set("lng", String(center.lng));
        }
        const res = await fetch(`/api/venues/search?${params}`);
        if (res.ok) {
          const { match } = (await res.json()) as {
            match: {
              bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
            } | null;
          };
          if (match && map) {
            setSearchState("idle");
            map.fitBounds(
              new maplibregl.LngLatBounds(
                [match.bounds.minLng, match.bounds.minLat],
                [match.bounds.maxLng, match.bounds.maxLat],
              ),
              { padding: 64, maxZoom: 16, duration: 800 },
            );
            return;
          }
        }
      } catch {
        // 店舗検索が失敗しても、下の住所解決で拾えることがあるので続行する。
      }

      // 掲載が無い場所(住所を直接入れた場合など)は住所として解決する。
      const hit = await geocode(q);
      if (!hit) {
        setSearchState("notFound");
        return;
      }
      setSearchState("idle");
      mapRef.current?.flyTo({ center: [hit.lng, hit.lat], zoom: 15, speed: 1.4 });
    },
    [query],
  );

  // アフタータグの切り替え時は、手元のピン・カードを捨ててアフター用/通常用に取り直す
  // (通常の取得にはアフターが含まれていないので、クライアントの絞り込みだけでは出せない)。
  useEffect(() => {
    const next = genre === AFTER_GENRE;
    if (afterMode.current === next) return;
    afterMode.current = next;
    setPins([]);
    setCards([]);
    if (mapRef.current) fetchForCurrentView();
  }, [genre, fetchForCurrentView]);

  // ジャンルフィルタ変更時にソースを差し替え
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(filteredPins));
  }, [filteredPins, mapReady]);

  const focusVenue = useCallback(
    (id: string, opts?: { fromMap?: boolean }) => {
      const venue = venueById.get(id);
      if (!venue) {
        // カード未取得のピン(表示範囲は広いがカードは中心付近30件しか持っていない場合)。
        const pin = pins.find((p) => p.id === id);
        if (!pin) return;
        // 地図は動かさず、そのピンの周辺ぶんのカードだけ取り直す(一番近い＝そのピンの店舗が先頭に来る)。
        setActiveId(id);
        pendingCenterId.current = id;
        void fetchForQuery(
          `lat=${pin.lat}&lng=${pin.lng}&radius=${INITIAL_RADIUS_M}&limit=${MAX_CARDS}`,
        );
        return;
      }
      setActiveId(id);

      // ピンをタップしたときは地図を動かさない(ハイライトとカードの移動だけ)。
      // カードから選んだときも、ピンが画面外にあるときだけ寄せる。ズームは変えない。
      if (!opts?.fromMap) revealOnMap(venue.location.lng, venue.location.lat);

      // タップしたカード(またはピンに対応するカード)を中央に寄せる。
      centerCard(id);
    },
    [venueById, pins, fetchForQuery, centerCard, revealOnMap],
  );

  useEffect(() => {
    focusVenueRef.current = focusVenue;
  }, [focusVenue]);

  // 取得し直したカードの中に今のアクティブ店舗が居なくなったら、先頭カードに戻す。
  // (これが無いと、初回表示やパン直後にアクティブが決まらず、動画も再生されずピンも拡大しない)
  useEffect(() => {
    if (cards.length === 0) {
      setActiveId(null);
      return;
    }
    const stillThere = activeId !== null && cards.some((c) => c.id === activeId);
    if (stillThere) {
      // カード未取得のピンをタップして取り直した直後は、そのカードを中央へ寄せる。
      if (activeId && pendingCenterId.current === activeId) {
        pendingCenterId.current = null;
        const idToCenter = activeId;
        window.setTimeout(() => centerCard(idToCenter, "auto"), 0);
      }
      return;
    }
    setActiveId(cards[0].id);
    // 別の場所のカード一覧に入れ替わっているので、横スクロールも先頭に戻す。
    if (carouselRef.current) {
      suppressScrollSync.current = true;
      carouselRef.current.scrollTo({ left: 0 });
      window.setTimeout(() => (suppressScrollSync.current = false), 300);
    }
  }, [cards, activeId, centerCard]);

  // 選択中の店舗のピンを拡大して、下のカードとどのピンが対応しているかを分かるようにする。
  // paint式はReactのstateを直接読めないので、activeIdが変わるたびに式を差し替える。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const radiusFor = (base: number, focused: number) =>
      ["case", ["==", ["get", "id"], activeId ?? ""], focused, base] as unknown as maplibregl.ExpressionSpecification;
    // 一度大きめに膨らませてから落ち着かせる(paint transitionで補間されて、ポンと弾むように見える)。
    map.setPaintProperty(POINT_LAYER, "circle-radius", radiusFor(8, 17));
    map.setPaintProperty(SPONSORED_LAYER, "circle-radius", radiusFor(12, 21));
    map.setFilter(ACTIVE_GLOW_LAYER, [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "id"], activeId ?? ""],
    ] as unknown as maplibregl.FilterSpecification);
    map.setPaintProperty(ACTIVE_GLOW_LAYER, "circle-radius", 34);
    const settle = window.setTimeout(() => {
      map.setPaintProperty(POINT_LAYER, "circle-radius", radiusFor(8, 13));
      map.setPaintProperty(SPONSORED_LAYER, "circle-radius", radiusFor(12, 17));
      map.setPaintProperty(ACTIVE_GLOW_LAYER, "circle-radius", 24);
    }, 200);
    return () => window.clearTimeout(settle);
  }, [activeId, mapReady]);

  // プレビュー動画は中央に来ているカードだけを再生する(モバイル回線・端末負荷の配慮)。
  // <video autoPlay>はマウント時にしか効かないため、アクティブカードの切り替えに合わせて
  // 明示的にplay/pauseを呼ぶ必要がある。
  useEffect(() => {
    for (const [id, video] of videoRefs.current.entries()) {
      // 全画面リールを開いている間は、背後のカード動画を止める(二重再生・無駄な転送を防ぐ)。
      if (id === activeId && !reelOverlayVenueId) {
        void video.play().catch(() => {
          /* 端末の自動再生制限で失敗してもポスター画像のままにする */
        });
      } else {
        video.pause();
        // 一度も再生していないカードで currentTime を触ると、ブラウザによっては
        // preload="none" でも読み込みが始まるので、再生済みのものだけ巻き戻す。
        if (video.currentTime > 0) video.currentTime = 0;
      }
    }
  }, [activeId, visibleVenues, reelOverlayVenueId]);

  /** 全画面リールの開閉アニメーションの起点・終点にする、カードのプレビュー部分の位置。 */
  const getCardRect = useCallback((venueId: string): CardRect | null => {
    const card = cardRefs.current.get(venueId);
    const preview = card?.querySelector<HTMLElement>("[data-card-preview]") ?? card;
    if (!preview) return null;
    const r = preview.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }, []);

  /**
   * 全画面リールで見ている店舗が隣の店舗に進んだら、背後のカルーセルと地図もそこへ合わせる。
   * 閉じたときに、最後に見ていた店舗のカードへ縮んで戻れるようにするため。
   */
  const syncFromReelOverlay = useCallback(
    (venueId: string) => {
      setActiveId(venueId);
      centerCard(venueId, "auto");
      const venue = venueById.get(venueId);
      // 背後の地図は、その店舗のピンが画面外のときだけ瞬時に寄せる。
      if (venue) revealOnMap(venue.location.lng, venue.location.lat, 0);
    },
    [venueById, centerCard, revealOnMap],
  );

  /** カードのプレビュー部分のタップ。選択中のカードならリールを開き、そうでなければまず選択する。 */
  const handlePreviewTap = useCallback(
    (venue: VenueCardData, e: React.MouseEvent) => {
      e.stopPropagation();
      if (venue.id !== activeId) {
        focusVenue(venue.id);
        return;
      }
      if (venue.reelCount > 0) {
        setReelOverlayVenueId(venue.id);
      } else {
        router.push(`/shops/${venue.id}`);
      }
    },
    [activeId, focusVenue, router],
  );

  // カルーセルのスクロールで一番中央に近いカードをアクティブにし、地図をパンする
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (suppressScrollSync.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const containerCenter = el.scrollLeft + el.clientWidth / 2;
        let closestId: string | null = null;
        let closestDist = Infinity;
        for (const [id, card] of cardRefs.current.entries()) {
          const cardCenter = card.offsetLeft + card.clientWidth / 2;
          const dist = Math.abs(cardCenter - containerCenter);
          if (dist < closestDist) {
            closestDist = dist;
            closestId = id;
          }
        }
        if (closestId && closestId !== activeId) {
          setActiveId(closestId);
          const venue = venueById.get(closestId);
          // スワイプで選んだ店舗のピンが画面外のときだけ地図を寄せる(見えていれば動かさない)。
          if (venue) revealOnMap(venue.location.lng, venue.location.lat);
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [activeId, venueById, revealOnMap]);

  // ボトムナビの検索ボタンから開いたときは、このマップ本来の住所検索欄にフォーカスするだけにする
  // (ホームのグリッド絞り込みモーダルには繋がない。マップはピン移動が本来の検索体験のため)。
  useEffect(() => {
    function handleOpenSearch() {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
  }, []);

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <div className="relative flex-1">
        {/*
          maplibre-gl.css は自身が挿入するコンテナに `.maplibregl-map { position: relative }` を
          あてる。Tailwindの`absolute`ユーティリティと詳細度が同じ単一クラスのため、
          CSS読み込み順(maplibre-gl.cssが後勝ち)でposition:relativeに上書きされ、
          absolute inset-0が効かず高さ0に潰れてしまう。インラインstyleで確実に勝たせる。
        */}
        <div ref={mapContainerRef} className="luxela-venue-map" style={{ position: "absolute", inset: 0 }} />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-3">
          <div className="flex items-center gap-2">
            {/*
              PCではヘッダーもボトムナビも出ない(ボトムナビはmd:hidden)ので、
              これが無いとマップから他のページへ戻れない行き止まりになる。
              モバイルはボトムナビがあるので出さない。
            */}
            <Link
              href="/"
              className="pointer-events-auto hidden shrink-0 items-center rounded-full border border-amber-500/20 bg-black/70 px-4 py-2 font-display text-lg font-semibold uppercase tracking-[0.2em] text-gold backdrop-blur transition hover:border-amber-400/50 md:inline-flex"
            >
              LOCAPASS
            </Link>
          {/* 近くに店舗が無いときの最後の手段。住所・エリア名で地図を飛ばす。 */}
          <form
            onSubmit={handleSearch}
            className="pointer-events-auto flex flex-1 items-center gap-2 rounded-full border border-amber-500/20 bg-black/70 px-4 py-2 backdrop-blur"
          >
            {/* 送信ボタンを明示的に置く。input1個だけのフォームは暗黙送信に頼ることになり、
                Enterが効かない環境がある(PCでは押せる要素も無くなる)。 */}
            <button type="submit" aria-label={t.map.search} className="shrink-0 text-amber-400/80">
              <Search size={15} />
            </button>
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.map.searchPlaceholder}
              aria-label={t.map.search}
              // iOSで16px未満のinputにフォーカスすると画面が自動ズームするため16px以上にする
              className="min-w-0 flex-1 bg-transparent text-[16px] text-white placeholder:text-neutral-500 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSearchState("idle");
                }}
                aria-label={t.common.close}
                className="shrink-0 text-neutral-400 hover:text-white"
              >
                <X size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={goToMyLocation}
              aria-label={t.map.useMyLocation}
              className="shrink-0 text-amber-300"
            >
              <Navigation size={15} />
            </button>
          </form>
          {/* マップはサイト共通ヘッダーを出さないので、言語切替はここに置く。 */}
          <div className="pointer-events-auto shrink-0 rounded-full bg-black/70 backdrop-blur">
            <LanguageSwitcher />
          </div>
          </div>
          {searchState !== "idle" && (
            <p className="pointer-events-none px-3 text-[11px] text-neutral-300">
              {searchState === "searching" ? t.map.searching : t.map.notFound}
            </p>
          )}
          <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {genrePills.map((pill) => (
              <button
                key={pill.value}
                onClick={() => setGenre(pill.value)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide transition ${
                  genre === pill.value
                    ? "border-amber-400 bg-amber-400 text-black"
                    : "border-white/15 bg-black/70 text-neutral-200 backdrop-blur"
                }`}
              >
                [ {pill.value === "all" ? t.map.all : genreLabel(locale, pill.value)} ]
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* モバイルではボトムナビ(SiteChrome、fixed bottom-0)がこの下に重なるので、
          カードが隠れないようナビ+セーフエリアぶんの余白を下に確保する。

          カルーセルの高さは固定する。カードの中身(キャストの有無、同一ビル表記の有無、
          そもそも0件かどうか)で高さが変わると、地図(flex-1)の高さが動く
          → resize → 表示範囲が変わる → 取り直す → カードが入れ替わる → また高さが動く、
          という再描画ループになる(PCの広い画面で発生)。 */}
      <div className="relative z-10 shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-6 pb-[calc(env(safe-area-inset-bottom)+60px)] md:pb-4">
        {visibleVenues.length === 0 ? (
          <div className={`${CAROUSEL_HEIGHT} flex gap-3 px-4`}>
            {loading ? (
              [0, 1].map((i) => (
                <div
                  key={i}
                  className="h-full w-[82vw] shrink-0 animate-pulse rounded-2xl border border-white/10 bg-zinc-900/60 sm:w-80"
                />
              ))
            ) : (
              <p className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-neutral-500">
                {tooWide ? t.map.zoomIn : t.map.noVenuesInView}
              </p>
            )}
          </div>
        ) : (
          <div
            ref={carouselRef}
            // 両端の余白は「カード幅の半分を引いた画面中央まで」。これが無いと最初・最後のカードは中央に来られない
            // (カード幅: スマホ82vw → 余白9vw、sm以上20rem → 余白は50%-10rem)。
            className={`${CAROUSEL_HEIGHT} flex snap-x snap-mandatory gap-3 overflow-x-auto px-[9vw] sm:px-[calc(50%-10rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
          >
            {visibleVenues.map((venue) => {
              const mates = buildingMates(venue);
              const isActive = venue.id === activeId;
              const eta = estimateTimeFromDistance(userPos, venue.location);
              return (
                <div
                  key={venue.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(venue.id, el);
                    else cardRefs.current.delete(venue.id);
                  }}
                  onClick={() => focusVenue(venue.id)}
                  // 中央のカードは原寸・左右のカードは少し縮めて暗くし、スワイプで入れ替わる様子を見せる。
                  // transformは高さのレイアウトを変えないので、カルーセル固定高さの制約(再描画ループ防止)は崩れない。
                  className={`flex h-full w-[82vw] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border bg-zinc-950 shadow-xl transition-[transform,opacity,border-color,box-shadow] duration-300 ease-out sm:w-80 ${
                    isActive
                      ? "scale-100 border-amber-400/70 opacity-100 shadow-amber-500/20"
                      : "scale-[0.94] border-white/10 opacity-60"
                  } ${venue.isSponsored ? "ring-1 ring-purple-500/40" : ""}`}
                >
                  <div
                    data-card-preview
                    onClick={(e) => handlePreviewTap(venue, e)}
                    className="relative min-h-0 w-full flex-1 cursor-pointer bg-neutral-900"
                  >
                    {/* 動画は動画オプション契約店舗だけ(サーバー側でpreviewVideoUrlを出し分け)。
                        中央のカード以外はpreload="none"にして、並んでいるだけの動画を読み込ませない
                        (30枚ぶんの先読みがそのまま転送量＝課金になるため)。 */}
                    {venue.previewVideoUrl ? (
                      <StreamVideo
                        ref={(el) => {
                          if (el) videoRefs.current.set(venue.id, el);
                          else videoRefs.current.delete(venue.id);
                        }}
                        src={venue.previewVideoUrl}
                        active={isActive}
                        poster={venue.imageUrl ?? undefined}
                        muted
                        loop
                        playsInline
                        preload={isActive ? "auto" : "none"}
                        className="h-full w-full bg-black object-cover"
                      />
                    ) : venue.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={venue.imageUrl}
                        alt={venue.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      // 画像も無い店舗はLOCAPASSの黒背景(画像ファイルを持たずCSSだけで描く)。
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-900 via-black to-neutral-950">
                        <span className="font-display text-sm uppercase tracking-[0.3em] text-gold/40">
                          LOCAPASS
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2">
                      {venue.isSponsored ? (
                        <span className="rounded bg-purple-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
                          SPONSORED
                        </span>
                      ) : (
                        <span />
                      )}
                      {venue.isSponsored && venue.sponsoredRank === 1 && (
                        <span className="rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-300">
                          RANK #1
                        </span>
                      )}
                    </div>
                    {/* 再生中(=アクティブカード)は再生アイコンを出さない */}
                    {venue.previewVideoUrl && !isActive && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="h-9 w-9 fill-white/90 text-white/90 drop-shadow" />
                      </div>
                    )}
                    {/* リールがある店舗は、選択中なら「タップでリール」、それ以外は本数を出す。 */}
                    {venue.reelCount > 0 && (
                      <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white backdrop-blur">
                        <Play className="h-3 w-3 fill-white text-white" />
                        {isActive ? t.map.watchReels : `REEL ${venue.reelCount}`}
                      </span>
                    )}
                  </div>

                  <div className="shrink-0 space-y-2 p-3">
                    <p className="truncate font-display text-sm font-bold text-white">{venue.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                      {venue.genre && <span>{genreLabel(locale, venue.genre)}</span>}
                      {venue.supportsEnglish && (
                        <span className="inline-flex items-center gap-0.5 text-amber-300">
                          <Globe2 className="h-3 w-3" /> EN
                        </span>
                      )}
                      {venue.isVerified && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> VERIFIED
                        </span>
                      )}
                    </div>

                    {venue.casts.length > 0 && (
                      <div className="flex -space-x-2">
                        {venue.casts.slice(0, 5).map((c) => (
                          <div
                            key={c.id}
                            title={c.name}
                            className={`h-7 w-7 shrink-0 overflow-hidden rounded-full border-2 bg-neutral-800 ${
                              c.isWorkingNow ? "border-emerald-400" : "border-zinc-950"
                            }`}
                          >
                            {c.avatarUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.avatarUrl} alt={c.name} className="h-full w-full object-cover" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {mates.length > 0 && (
                      <p className="text-[11px] text-neutral-500">{t.map.sameBuilding(mates.length)}</p>
                    )}

                    {eta && (eta.carMinutes > 0 || eta.walkMinutes !== null) && (
                      <div className="flex items-center gap-2 text-[11px] text-amber-300/90">
                        {eta.walkMinutes !== null && (
                          <span>
                            {eta.walkMinutes < 2 ? t.map.walkNow : t.map.walkTime(eta.walkMinutes)}
                          </span>
                        )}
                        {eta.walkMinutes !== null && eta.carMinutes >= 3 && <span className="text-neutral-600">・</span>}
                        {eta.carMinutes >= 3 && <span>{t.map.carTime(eta.carMinutes)}</span>}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${venue.location.lat},${venue.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 rounded-full bg-amber-400 py-2 text-center text-xs font-bold tracking-wide text-black transition hover:bg-amber-300"
                      >
                        {t.map.visitNow} →
                      </a>
                      <Link
                        href={`/shops/${venue.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-full border border-white/15 px-3 py-2 text-xs text-neutral-300 transition hover:border-amber-400/50 hover:text-amber-300"
                      >
                        {t.map.details}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reelOverlayVenueId && (
        <MapReelOverlay
          venues={visibleVenues}
          startVenueId={reelOverlayVenueId}
          getCardRect={getCardRect}
          onActiveVenueChange={syncFromReelOverlay}
          onClosed={() => setReelOverlayVenueId(null)}
        />
      )}
    </div>
  );
}
