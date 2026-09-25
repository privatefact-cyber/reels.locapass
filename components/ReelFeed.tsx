"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronLeft, X } from "lucide-react";
import { useActiveReelIndex } from "@/lib/reels/useActiveReelIndex";
import { useReelLikes } from "@/lib/reels/useReelLikes";
import { useCastFollows, useShopFavorites } from "@/lib/reels/useFollows";
import { reelCtaUrl } from "@/lib/reels/links";
import { ReelCard } from "@/components/ReelCard";
import { PreloadNextVideo } from "@/components/video/PreloadNextVideo";
import type { AdItem, ReelItem, ShopGridItem } from "@/lib/reels/types";
import { OPEN_FEED_GATE_EVENT, OPEN_SEARCH_EVENT, TOGGLE_NOW_EVENT } from "@/lib/reels/events";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { genreLabel } from "@/lib/i18n/genreLabels";
import { setAiSelectedContext } from "@/lib/aiContext";
import { isHiddenByDefaultGenre } from "@/lib/shop/genres";

export type { ReelItem } from "@/lib/reels/types";

type ContentType = "cast" | "shop";

type Tile =
  | { kind: "cast"; reel: ReelItem }
  | { kind: "shop"; shop: ShopGridItem }
  | { kind: "ad"; ad: AdItem; adKey: string };

const GATE_ANIM_MS = 250;
const GATE_IDLE_MS = 5000;

// リール一覧は最後まで見きっても先頭へ戻すのではなく、同じ並びをもう一周ぶん継ぎ足して
// 下スワイプを永遠に続けられるようにする(ReelLoopFeedと同じ思想)。
const MAX_CYCLES = 50;

// SHOPホバー時プレビュー: 実際の店舗詳細ページ(/shops/[id])を縮小表示する(スマホ1画面分をまるごと縮小)。
const PEEK_IFRAME_WIDTH = 375;
const PEEK_IFRAME_HEIGHT = 812;
const PEEK_WIDTH = 224;
const PEEK_SCALE = PEEK_WIDTH / PEEK_IFRAME_WIDTH;
const PEEK_IFRAME_HEIGHT_SCALED = Math.round(PEEK_IFRAME_HEIGHT * PEEK_SCALE);
const PEEK_FOOTER_HEIGHT = 52;
const PEEK_TOTAL_HEIGHT = PEEK_IFRAME_HEIGHT_SCALED + PEEK_FOOTER_HEIGHT;

// 最初の「REEL/SHOP」ゲート、およびREEL選択後の「SHOP REEL/ICON REEL」ゲートで
// 共用する、すりガラスの2択カード。見た目は完全に共通なので1つにまとめている。
function GateOverlay({
  closing,
  entering,
  optionA,
  optionB,
}: {
  closing: boolean;
  entering: boolean;
  optionA: { label: string; onClick: () => void };
  optionB: { label: string; onClick: () => void };
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-[250ms] will-change-[opacity] ${
        closing || entering ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        className={`relative flex w-[86vw] max-w-sm aspect-square transform-gpu flex-col items-center justify-center gap-8 overflow-hidden rounded-[2.5rem] border border-main/25 bg-main/[0.04] p-8 shadow-2xl shadow-black/40 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-[250ms] ease-out will-change-transform ${
          closing || entering ? "scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-main/10 via-transparent to-transparent"
        />
        <span className="relative text-2xl font-thin tracking-[0.3em] text-main/25 uppercase">
          LOCAPASS
        </span>
        <div className="relative grid w-full grid-cols-2 gap-4">
          <button
            type="button"
            onClick={optionA.onClick}
            className="aspect-square rounded-2xl border border-main/25 bg-main/[0.03] text-sm tracking-wide text-main/90 backdrop-blur-md transition hover:bg-main/10"
          >
            {optionA.label}
          </button>
          <button
            type="button"
            onClick={optionB.onClick}
            className="aspect-square rounded-2xl border border-main/25 bg-main/[0.03] text-sm tracking-wide text-main/90 backdrop-blur-md transition hover:bg-main/10"
          >
            {optionB.label}
          </button>
        </div>
      </div>
    </div>
  );
}

function tileKey(tile: Tile) {
  if (tile.kind === "cast") return `cast:${tile.reel.id}`;
  if (tile.kind === "shop") return `shop:${tile.shop.id}`;
  return `ad:${tile.adKey}`;
}

/** ICON(投稿リール)とSHOP(店舗ディレクトリ)のタイルを交互に混ぜて1つのグリッドにする。 */
function buildTiles(castReels: ReelItem[], shopItems: ShopGridItem[]): Tile[] {
  const merged: Tile[] = [];
  const max = Math.max(castReels.length, shopItems.length);
  for (let i = 0; i < max; i++) {
    if (castReels[i]) merged.push({ kind: "cast", reel: castReels[i] });
    if (shopItems[i]) merged.push({ kind: "shop", shop: shopItems[i] });
  }
  return merged;
}

/**
 * システム管理者が投稿したPR(広告)を、各adが指定する頻度でタイル列に挟み込む。
 * 例: frequency=8のPRは、コンテンツタイル(ICON/SHOP)を8件表示するごとに1回挟まる。
 * 複数のPRが同じ位置で重なった場合は両方とも挟む(単純化のため優先度は付けない)。
 */
function injectAds(tiles: Tile[], ads: AdItem[]): Tile[] {
  if (!ads.length) return tiles;
  const result: Tile[] = [];
  let contentCount = 0;
  for (const tile of tiles) {
    result.push(tile);
    contentCount++;
    for (const ad of ads) {
      if (ad.frequency >= 2 && contentCount % ad.frequency === 0) {
        result.push({ kind: "ad", ad, adKey: `${ad.id}@${contentCount}` });
      }
    }
  }
  return result;
}

function tileThumbUrl(tile: Tile): string | undefined {
  if (tile.kind === "shop") return tile.shop.coverImageUrl ?? undefined;
  const media = tile.kind === "ad" ? tile.ad.media : tile.reel.media[0];
  return media?.type === "video" ? (media.poster ?? undefined) : media?.url;
}

// posterが未設定の動画リールは、静止画の代わりに<video>を先頭フレーム表示用に置く
// (再生はしない。preload="metadata"でブラウザが最初のフレームを自動描画する)。
function tileFallbackVideoUrl(tile: Tile): string | undefined {
  if (tile.kind === "shop") return undefined;
  const media = tile.kind === "ad" ? tile.ad.media : tile.reel.media[0];
  return media?.type === "video" && !media.poster ? media.url : undefined;
}

/** リール一覧(縦スワイプ)のタイルが持つ動画URL(先読み対象の判定に使う)。 */
function tileVideoUrl(tile: Tile | undefined): string | undefined {
  if (!tile || tile.kind === "shop") return undefined;
  const media = tile.kind === "ad" ? tile.ad.media : tile.reel.media[0];
  return media?.type === "video" ? media.url : undefined;
}

// グリッドの1タイル。memo化して、SHOPホバー時のプレビュー表示切り替えなど
// 親(ReelFeed)側のstate変化のたびに全タイルが再レンダリングされないようにする
// (tile/index/コールバックの参照が変わらない限り再描画しない)。
const GridTile = memo(function GridTile({
  tile,
  index,
  onOpen,
  onShopPeekEnter,
  onShopPeekLeave,
}: {
  tile: Tile;
  index: number;
  onOpen: (index: number) => void;
  onShopPeekEnter: (shop: ShopGridItem, e: React.MouseEvent<HTMLElement>) => void;
  onShopPeekLeave: () => void;
}) {
  const thumbUrl = tileThumbUrl(tile);
  const fallbackVideoUrl = thumbUrl ? undefined : tileFallbackVideoUrl(tile);
  const label = tile.kind === "cast" ? tile.reel.castName : tile.kind === "shop" ? tile.shop.name : tile.ad.title;
  const sublabel = tile.kind === "cast" ? tile.reel.shopName : tile.kind === "shop" ? tile.shop.area : undefined;
  return (
    <button data-surface="media"
      type="button"
      onClick={() => onOpen(index)}
      onMouseEnter={tile.kind === "shop" ? (e) => onShopPeekEnter(tile.shop, e) : undefined}
      onMouseLeave={tile.kind === "shop" ? onShopPeekLeave : undefined}
      className="group relative block aspect-square w-full overflow-hidden rounded-none bg-panel-900 text-left"
    >
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          loading="lazy"
          className="h-full w-full transform-gpu object-cover transition duration-300 will-change-transform group-hover:scale-105 group-hover:brightness-110"
        />
      ) : fallbackVideoUrl ? (
        // モバイルSafari等の省データ仕様では#t=0.001を付けないと先頭フレームへ
        // シークしてくれず真っ黒のままになるため明示的に付与する。
        <video
          src={`${fallbackVideoUrl}#t=0.001`}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full transform-gpu object-cover transition duration-300 will-change-transform group-hover:scale-105 group-hover:brightness-110"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tone-800 via-tone-950 to-black">
          <span className="font-display text-xs uppercase tracking-[0.2em] text-accent/50">
            LOCAPASS
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />

      <span
        className={`pointer-events-none absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${
          tile.kind === "cast"
            ? "bg-accent/90 text-on-accent"
            : tile.kind === "ad"
              ? "bg-hl-400/90 text-on-accent"
              : "bg-main/20 text-main"
        }`}
      >
        {tile.kind === "cast" ? "ICON" : tile.kind === "ad" ? "PR" : "SHOP"}
      </span>

      <span className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4">
        <span dir="auto" className="block truncate text-[11px] font-semibold text-main drop-shadow">
          {label}
        </span>
        {sublabel && (
          <span dir="auto" className="block truncate text-[10px] text-main/70">{sublabel}</span>
        )}
      </span>
    </button>
  );
});

export function ReelFeed({
  reels,
  nowReels,
  shops,
  genreChoices,
  ads = [],
}: {
  reels: ReelItem[];
  /** 今まさに稼働中(出勤前後1時間バッファ込み)のICONの、最新リール1本ずつ。 */
  nowReels: ReelItem[];
  shops: ShopGridItem[];
  genreChoices: string[];
  /** システム管理者が投稿するPR。各adの頻度でグリッド/リール一覧に紛れ込ませる。 */
  ads?: AdItem[];
}) {
  const { locale, t } = useLocale();
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<ContentType[]>([]);
  // 選択中のキーワード/ジャンルをコンシェルジュAIに渡す(聞き返さず、その条件でおすすめを出せるように)。
  useEffect(() => {
    setAiSelectedContext({ keyword: keyword.trim(), genres: activeGenres });
    return () => setAiSelectedContext({ keyword: "", genres: [] });
  }, [keyword, activeGenres]);
  const [nowOnly, setNowOnly] = useState(false);
  const nowOnlyRef = useRef(false);
  const [gateOpen, setGateOpen] = useState(false);
  // gateClosing/gateEnteringはどちらも「縮小+透明」の見た目で、開閉どちらもブワっと同じアニメーションになる。
  const [gateClosing, setGateClosing] = useState(false);
  const [gateEntering, setGateEntering] = useState(false);
  // REELを選んだ後に出す2段目のゲート(SHOP REEL/ICON REEL の分岐)。見た目・開閉アニメーションは
  // 1段目と同じ(GateOverlayを共用)。
  const [reelGateOpen, setReelGateOpen] = useState(false);
  const [reelGateClosing, setReelGateClosing] = useState(false);
  const [reelGateEntering, setReelGateEntering] = useState(false);
  // リールの投稿者種別での絞り込み(ショップアカウント投稿 vs ICON本人投稿)。
  // 2段目のゲートで選んだ結果を保持する(null=絞り込みなし)。
  const [reelAuthorFilter, setReelAuthorFilter] = useState<"cast" | "shop" | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [peek, setPeek] = useState<{ shop: ShopGridItem; rect: DOMRect } | null>(null);
  const { liked, likeCounts, toggleLike } = useReelLikes(reels);
  const { followedCastIds, toggleCastFollow } = useCastFollows();
  const { favoritedShopIds, toggleShopFavorite } = useShopFavorites();
  const gateOpenRef = useRef(false);
  const overlayItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    gateOpenRef.current = gateOpen;
  }, [gateOpen]);

  useEffect(() => {
    nowOnlyRef.current = nowOnly;
  }, [nowOnly]);

  function openGate() {
    setGateClosing(false);
    setGateEntering(true);
    setGateOpen(true);
  }

  function closeGate() {
    setGateClosing(true);
    window.setTimeout(() => {
      setGateOpen(false);
      setGateClosing(false);
    }, GATE_ANIM_MS);
  }

  function openReelGate() {
    setReelGateClosing(false);
    setReelGateEntering(true);
    setReelGateOpen(true);
  }

  function closeReelGate() {
    setReelGateClosing(true);
    window.setTimeout(() => {
      setReelGateOpen(false);
      setReelGateClosing(false);
    }, GATE_ANIM_MS);
  }

  useEffect(() => {
    // ボトムナビのハンバーガーボタンから開かれる(他ページからの遷移は ?menu=1 で受け取る)。
    if (new URLSearchParams(window.location.search).get("menu")) {
      openGate();
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (new URLSearchParams(window.location.search).get("search")) {
      setSearchOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (new URLSearchParams(window.location.search).get("now")) {
      setNowOnly(true);
      window.history.replaceState(null, "", window.location.pathname);
    }

    function handleToggleGate() {
      if (gateOpenRef.current) {
        closeGate();
      } else {
        openGate();
      }
    }
    function handleToggleSearch() {
      setSearchOpen((v) => !v);
    }
    function handleToggleNow() {
      setNowOnly(!nowOnlyRef.current);
    }
    window.addEventListener(OPEN_FEED_GATE_EVENT, handleToggleGate);
    window.addEventListener(OPEN_SEARCH_EVENT, handleToggleSearch);
    window.addEventListener(TOGGLE_NOW_EVENT, handleToggleNow);
    return () => {
      window.removeEventListener(OPEN_FEED_GATE_EVENT, handleToggleGate);
      window.removeEventListener(OPEN_SEARCH_EVENT, handleToggleSearch);
      window.removeEventListener(TOGGLE_NOW_EVENT, handleToggleNow);
    };
  }, []);

  // マウント直後は「縮小+透明」の状態で描画し、次のフレームで解除することでトランジションを発火させる。
  // rAFはタブが非表示だと呼ばれないことがあるため、setTimeoutも併用して確実に解除する。
  useEffect(() => {
    if (!gateOpen || !gateEntering) return;
    const raf = requestAnimationFrame(() => setGateEntering(false));
    const timer = window.setTimeout(() => setGateEntering(false), 30);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [gateOpen, gateEntering]);

  // 一定時間(5秒)操作がなければ自動的に閉じる。
  useEffect(() => {
    if (!gateOpen || gateClosing || gateEntering) return;
    const timer = window.setTimeout(closeGate, GATE_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [gateOpen, gateEntering, gateClosing]);

  useEffect(() => {
    if (!reelGateOpen || !reelGateEntering) return;
    const raf = requestAnimationFrame(() => setReelGateEntering(false));
    const timer = window.setTimeout(() => setReelGateEntering(false), 30);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [reelGateOpen, reelGateEntering]);

  useEffect(() => {
    if (!reelGateOpen || reelGateClosing || reelGateEntering) return;
    const timer = window.setTimeout(closeReelGate, GATE_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [reelGateOpen, reelGateEntering, reelGateClosing]);

  // 1段目: SHOPは店舗ディレクトリへ直行(店舗ページのみ、リールは混ぜない)。
  // REELは2段目のゲート(SHOP REEL/ICON REEL)へ進む。
  function selectFeedFromGate(type: ContentType) {
    if (type === "shop") {
      setActiveTypes(["shop"]);
      setReelAuthorFilter(null);
      closeGate();
      return;
    }
    closeGate();
    openReelGate();
  }

  // 2段目: リールの投稿者種別(ショップアカウント or ICON本人)を選ぶ。
  function selectReelAuthorFromGate(author: "cast" | "shop") {
    setActiveTypes(["cast"]);
    setReelAuthorFilter(author);
    closeReelGate();
  }

  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reels) {
      map.set(
        r.id,
        [r.shopName, r.area, r.address].filter(Boolean).join(" ").toLowerCase(),
      );
    }
    for (const s of shops) {
      map.set(`shop:${s.id}`, [s.name, s.area, s.address].filter(Boolean).join(" ").toLowerCase());
    }
    return map;
  }, [reels, shops]);

  // ICON/SHOPタグはどちらも選ばれていなければ「絞り込みなし」＝両方表示(ジャンルタグと同じ思想)。
  const showCast = activeTypes.length === 0 || activeTypes.includes("cast");
  const showShop = activeTypes.length === 0 || activeTypes.includes("shop");

  // 絞り込み結果は、ホバーによるpeek表示切り替えなど関係のないstateが変わるたびに
  // 再計算されないようメモ化する。
  // アフター(深夜飲食店)は通常の一覧・キーワード検索には出さず、そのタグを押したときだけ出す。
  const hiddenUnlessSelected = useCallback(
    (genre: string | null) => isHiddenByDefaultGenre(genre) && !activeGenres.includes(genre!),
    [activeGenres],
  );

  const filteredReels = useMemo(
    () =>
      reels.filter((r) => {
        if (!showCast) return false;
        if (hiddenUnlessSelected(r.genre)) return false;
        if (reelAuthorFilter === "cast" && !r.castId) return false;
        if (reelAuthorFilter === "shop" && r.castId) return false;
        if (keyword && !(searchIndex.get(r.id) ?? "").includes(keyword.toLowerCase())) {
          return false;
        }
        if (activeGenres.length && !(r.genre && activeGenres.includes(r.genre))) {
          return false;
        }
        return true;
      }),
    [reels, showCast, reelAuthorFilter, keyword, searchIndex, activeGenres, hiddenUnlessSelected],
  );

  const filteredShops = useMemo(
    () =>
      shops.filter((s) => {
        if (!showShop) return false;
        if (hiddenUnlessSelected(s.genre)) return false;
        if (keyword && !(searchIndex.get(`shop:${s.id}`) ?? "").includes(keyword.toLowerCase())) {
          return false;
        }
        if (activeGenres.length && !(s.genre && activeGenres.includes(s.genre))) {
          return false;
        }
        return true;
      }),
    [shops, showShop, keyword, searchIndex, activeGenres, hiddenUnlessSelected],
  );

  // NOW絞り込み中は、キーワード・ジャンルの絞り込みはそのまま今まで通り効かせる
  // (ICON/SHOPタグの状態には左右されない。NOWは常に「稼働中のICON」だけが対象のため)。
  const filteredNowReels = useMemo(
    () =>
      nowReels.filter((r) => {
        if (hiddenUnlessSelected(r.genre)) return false;
        if (keyword && !(searchIndex.get(r.id) ?? "").includes(keyword.toLowerCase())) {
          return false;
        }
        if (activeGenres.length && !(r.genre && activeGenres.includes(r.genre))) {
          return false;
        }
        return true;
      }),
    [nowReels, keyword, searchIndex, activeGenres, hiddenUnlessSelected],
  );

  const tiles = useMemo(
    () =>
      injectAds(
        nowOnly ? buildTiles(filteredNowReels, []) : buildTiles(filteredReels, filteredShops),
        ads,
      ),
    [nowOnly, filteredNowReels, filteredReels, filteredShops, ads],
  );

  // リール一覧側は、最後まで見きったら先頭へ戻すのではなく、同じ並びをもう一周ぶん
  // 継ぎ足して下スワイプを続けられるようにする(永遠にループ)。
  const [cycles, setCycles] = useState(1);
  const tilesKey = useMemo(() => tiles.map(tileKey).join(","), [tiles]);

  useEffect(() => {
    setCycles(1);
  }, [tilesKey]);

  const loopedTiles = useMemo(() => {
    if (!tiles.length) return [];
    return Array.from({ length: cycles }, (_, cycleIndex) =>
      tiles.map((tile) => ({ tile, loopKey: `${tileKey(tile)}__${cycleIndex}` })),
    ).flat();
  }, [tiles, cycles]);

  const { activeIndex: overlayActiveIndex, registerItem: registerOverlayItem } =
    useActiveReelIndex(loopedTiles.length);

  useEffect(() => {
    if (!tiles.length) return;
    if (overlayActiveIndex >= loopedTiles.length - 3) {
      setCycles((c) => Math.min(c + 1, MAX_CYCLES));
    }
  }, [overlayActiveIndex, loopedTiles.length, tiles.length]);

  useEffect(() => {
    // 絞り込み条件が変わってタイルの中身が変わったら、開いていたオーバーレイは閉じる。
    setOpenIndex(null);
  }, [tiles.length]);

  useEffect(() => {
    if (openIndex === null) return;
    overlayItemRefs.current[openIndex]?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [openIndex]);

  useEffect(() => {
    if (openIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIndex]);

  // 検索モーダルはEscキーでも閉じる(PC向け。スマホは背景タップで閉じる)。
  useEffect(() => {
    if (!searchOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  function setOverlayItemRef(index: number) {
    return (el: HTMLDivElement | null) => {
      overlayItemRefs.current[index] = el;
      registerOverlayItem(index)(el);
    };
  }

  const handleShopPeekEnter = useCallback(
    (shop: ShopGridItem, e: React.MouseEvent<HTMLElement>) => {
      // タッチ端末はmouseenterが発火しても対応するmouseleaveが来ないことがあるため、
      // 実際にマウスでホバーできる環境(PC)でのみプレビューを出す。
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      setPeek({ shop, rect: e.currentTarget.getBoundingClientRect() });
    },
    [],
  );

  const handleShopPeekLeave = useCallback(() => {
    setPeek(null);
  }, []);

  // グリッドからリール一覧へ切り替えたときや、スクロールでタイルの位置がずれたときは
  // 開きっぱなしにならないよう必ず閉じる。
  useEffect(() => {
    setPeek(null);
  }, [openIndex]);

  useEffect(() => {
    if (!peek) return;
    function clearPeek() {
      setPeek(null);
    }
    window.addEventListener("scroll", clearPeek, { passive: true });
    window.addEventListener("touchstart", clearPeek, { passive: true });
    return () => {
      window.removeEventListener("scroll", clearPeek);
      window.removeEventListener("touchstart", clearPeek);
    };
  }, [peek]);

  function toggleType(t: ContentType) {
    // ゲートで選んだ投稿者種別の絞り込みは、ピルでの手動切り替えとは独立した状態なので、
    // ここで触られたら一旦リセットする(古い絞り込みが残って混乱するのを防ぐ)。
    setReelAuthorFilter(null);
    setActiveTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function toggleGenre(g: string) {
    setActiveGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  }

  function resetFilters() {
    setKeyword("");
  }

  const anyFilterActive = !!keyword;

  const pillClass = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition ${
      active
        ? "border-accent bg-accent text-on-accent font-semibold"
        : "border-tone-700 text-tone-300"
    }`;

  return (
    <div className="space-y-3 md:mx-auto md:max-w-[1400px] md:px-6 md:py-8">
      {gateOpen && (
        <GateOverlay
          closing={gateClosing}
          entering={gateEntering}
          optionA={{ label: "REEL", onClick: () => selectFeedFromGate("cast") }}
          optionB={{ label: "SHOP", onClick: () => selectFeedFromGate("shop") }}
        />
      )}

      {reelGateOpen && (
        <GateOverlay
          closing={reelGateClosing}
          entering={reelGateEntering}
          optionA={{ label: "SHOP REEL", onClick: () => selectReelAuthorFromGate("shop") }}
          optionB={{ label: "ICON REEL", onClick: () => selectReelAuthorFromGate("cast") }}
        />
      )}

      {searchOpen && (
        // 背景(暗くなっている部分)のどこをタップしても閉じる。×ボタンまで指を伸ばさせない。
        // パネル内のタップは stopPropagation で背景まで伝えない(入力中に閉じないように)。
        <div
          onClick={() => setSearchOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-main/10 bg-surface/95 p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-main">{t.nav.search}</h2>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label={t.common.close}
                className="text-muted hover:text-main"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-tone-700 bg-main/5 px-3 py-2">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                autoFocus
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t.feed.searchPlaceholder}
                className="w-full min-w-0 bg-transparent text-[16px] text-main placeholder:text-tone-500 focus:outline-none"
              />
            </div>
            {anyFilterActive && (
              <button
                type="button"
                onClick={resetFilters}
                className="mx-auto mt-3 block text-xs text-accent underline"
              >
                {t.feed.resetFilters}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="sticky top-[calc(81px+env(safe-area-inset-top))] z-30 flex items-center gap-2 px-1 py-2 bg-tone-950/90 backdrop-blur-md border-b border-main/5">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label={t.nav.search}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-tone-700 text-tone-300 transition hover:border-accent hover:text-accent"
        >
          <Search size={16} />
        </button>
        <div className="flex flex-1 gap-2 overflow-x-auto no-scrollbar">
          <button type="button" onClick={() => setNowOnly((v) => !v)} className={pillClass(nowOnly)}>
            NOW
          </button>
          {!nowOnly && (
            <>
              <button type="button" onClick={() => toggleType("cast")} className={pillClass(activeTypes.includes("cast"))}>
                ICON
              </button>
              <button type="button" onClick={() => toggleType("shop")} className={pillClass(activeTypes.includes("shop"))}>
                SHOP
              </button>
            </>
          )}
          {keyword && (
            <button
              type="button"
              onClick={resetFilters}
              className={`${pillClass(true)} inline-flex items-center gap-1`}
            >
              {keyword}
              <X size={12} strokeWidth={3} />
            </button>
          )}
          {genreChoices.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGenre(g)}
              className={pillClass(activeGenres.includes(g))}
            >
              {genreLabel(locale, g)}
            </button>
          ))}
        </div>
      </div>

      {tiles.length === 0 ? (
        <p className="px-2 py-10 text-center text-sm text-tone-500">
          {nowOnly ? t.feed.noNowPosts : t.feed.noResults}
        </p>
      ) : openIndex === null ? (
        // 完全スクエアのモザイクグリッド。ICON(投稿リール)とSHOP(店舗)を混在させ、
        // タップすると同じタイル列を対象に、下の縦スワイプリール一覧へ切り替わる
        // (ヘッダー・ボトムナビは常に表示されたまま、画面を覆う黒モーダルにはしない)。
        // ICON/SHOPが交互に並ぶ関係上、列数は必ず偶数にすること。奇数(5列等)にすると
        // 行ごとにICON/SHOPの開始位置がずれて、列が縦に揃わずバラバラに見えてしまう。
        // 縦向きタブレット(iPad mini 744pxなど、sm=640px以上)はgrid-cols-4のままだと
        // 1枚が小さい割に余白が目立つため、横向き(landscape)とは別に列数を増やす。
        // 判定はmdではなくsm(640px)を起点にする(iPad miniの縦幅744pxはmd=768px未満のため)。
        <div className="grid grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] md:max-w-7xl md:mx-auto lg:landscape:grid-cols-8">
          {tiles.map((tile, index) => (
            <GridTile
              key={tileKey(tile)}
              tile={tile}
              index={index}
              onOpen={setOpenIndex}
              onShopPeekEnter={handleShopPeekEnter}
              onShopPeekLeave={handleShopPeekLeave}
            />
          ))}
        </div>
      ) : (
        // 縦スワイプのリール一覧。ヘッダー・ボトムナビはページの通常コンテンツとして
        // そのまま表示され続ける(画面を覆う固定オーバーレイにはしない)。
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            className="flex items-center gap-1 px-1 text-sm text-tone-300 hover:text-main"
          >
            <ChevronLeft size={18} />
            グリッドに戻る
          </button>

          {/* 現在アクティブな1本の「次」の動画だけ、先頭2〜3秒ぶんを裏で先読みしておく
              (実際にアクティブになったときの再生開始までの待ち時間を減らす)。 */}
          <PreloadNextVideo src={tileVideoUrl(loopedTiles[overlayActiveIndex + 1]?.tile)} />

          {loopedTiles.map(({ tile, loopKey }, index) => (
            <div
              key={loopKey}
              ref={setOverlayItemRef(index)}
              className="relative mx-auto w-full overflow-hidden bg-black md:flex md:h-[85dvh] md:items-center md:justify-center"
            >
              {tile.kind === "cast" ? (
                (() => {
                  const media = tile.reel.media[0];
                  return (
                    <ReelCard
                      reelId={tile.reel.id}
                      castId={tile.reel.castId}
                      commentsEnabled={tile.reel.isCommentsEnabled}
                      isActive={index === overlayActiveIndex}
                      videoUrl={media?.type === "video" ? media.url : undefined}
                      posterImageUrl={media?.type === "video" ? media.poster : media?.url}
                      accountName={tile.reel.castName}
                      accountAvatarUrl={tile.reel.castAvatarUrl ?? undefined}
                      profileUrl={
                        tile.reel.castId ? `/cast/${tile.reel.castId}` : `/shops/${tile.reel.shopId}`
                      }
                      shopName={tile.reel.shopName}
                      createdAt={tile.reel.createdAt}
                      ctaUrl={reelCtaUrl(tile.reel)}
                      likesCount={likeCounts[tile.reel.id] ?? tile.reel.likesCount}
                      liked={liked.has(tile.reel.id)}
                      onToggleLike={() => toggleLike(tile.reel.id)}
                      followed={
                        tile.reel.castId
                          ? followedCastIds.has(tile.reel.castId)
                          : favoritedShopIds.has(tile.reel.shopId)
                      }
                      onToggleFollow={() =>
                        tile.reel.castId
                          ? toggleCastFollow(tile.reel.castId!)
                          : toggleShopFavorite(tile.reel.shopId)
                      }
                    />
                  );
                })()
              ) : tile.kind === "shop" ? (
                <ReelCard
                  isActive={index === overlayActiveIndex}
                  posterImageUrl={tile.shop.coverImageUrl ?? undefined}
                  posterCredit={tile.shop.coverAttribution}
                  accountName={tile.shop.name}
                  profileUrl={`/shops/${tile.shop.id}`}
                  shopName={tile.shop.area ?? ""}
                  ctaUrl={`/shops/${tile.shop.id}`}
                  likesCount={0}
                  followed={favoritedShopIds.has(tile.shop.id)}
                  onToggleFollow={() => toggleShopFavorite(tile.shop.id)}
                />
              ) : (
                <ReelCard
                  isActive={index === overlayActiveIndex}
                  isAd
                  videoUrl={tile.ad.media.type === "video" ? tile.ad.media.url : undefined}
                  posterImageUrl={
                    tile.ad.media.type === "video" ? (tile.ad.media.poster ?? undefined) : tile.ad.media.url
                  }
                  accountName="PR"
                  profileUrl={tile.ad.linkUrl}
                  shopName={tile.ad.title}
                  ctaUrl={tile.ad.linkUrl}
                  likesCount={0}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* SHOPタイルのホバー時に出すプレビュー(ホバー可能なPCのみ)。
          店舗詳細ページ(/shops/[id])を縮小表示することで、中身が一目でわかるようにする。
          グリッドセルの中に描画するとレイアウトが崩れるため、独立したポップアップとして
          ホバーしたタイルの位置を基準に浮かせて表示する。 */}
      {peek && (
        <div
          className="pointer-events-none fixed z-40 overflow-hidden rounded-2xl border border-main/15 bg-surface/95 shadow-2xl shadow-black/50 backdrop-blur-md"
          style={{
            width: PEEK_WIDTH,
            left: Math.min(
              Math.max(peek.rect.left + peek.rect.width / 2 - PEEK_WIDTH / 2, 8),
              window.innerWidth - PEEK_WIDTH - 8,
            ),
            top: Math.min(
              Math.max(peek.rect.top + peek.rect.height / 2 - PEEK_TOTAL_HEIGHT / 2, 8),
              window.innerHeight - PEEK_TOTAL_HEIGHT - 8,
            ),
          }}
        >
          <div
            className="relative w-full overflow-hidden bg-tone-950"
            style={{ height: PEEK_IFRAME_HEIGHT_SCALED }}
          >
            {/* 実ページの読み込みが見えるまでのフォールバック(カバー画像) */}
            {peek.shop.coverImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={peek.shop.coverImageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <iframe
              src={`/shops/${peek.shop.id}`}
              title={`${peek.shop.name}のプレビュー`}
              tabIndex={-1}
              scrolling="no"
              className="absolute left-0 top-0 origin-top-left border-0"
              style={{
                width: PEEK_IFRAME_WIDTH,
                height: PEEK_IFRAME_HEIGHT,
                transform: `scale(${PEEK_SCALE})`,
              }}
            />
          </div>
          <div className="space-y-1 border-t border-main/10 px-3 py-2">
            <p className="truncate text-sm font-semibold text-main">{peek.shop.name}</p>
            <p className="truncate text-xs text-main/70">
              {[peek.shop.area, peek.shop.genre ? genreLabel(locale, peek.shop.genre) : null]
                .filter(Boolean)
                .join(" / ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}