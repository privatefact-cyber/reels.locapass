"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, Loader2, MessageCircle, Plus, Share2, Volume2, VolumeX } from "lucide-react";
import { AvatarPeek } from "@/components/AvatarPeek";
import { ReelCommentSheet } from "@/components/ReelCommentSheet";
import { formatPostedAt } from "@/lib/reels/formatPostedAt";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { StreamVideo } from "@/components/video/StreamVideo";
import { streamThumbnailFromManifestUrl } from "@/lib/stream/playback";

export type ReelCardProps = {
  /** コメント欄を開くのに必要なリールID。店舗タイルなど、コメント対象のリールが無いカードでは省略する(コメントアイコン自体を出さない)。 */
  reelId?: string;
  /** リール投稿者のキャストID(店舗投稿など、キャストに紐付かないリールはnull)。 */
  castId?: string | null;
  /** falseの場合、コメントアイコンはタップできるが投稿フォームの代わりに受付終了メッセージを表示する。省略時はtrue扱い。 */
  commentsEnabled?: boolean;
  /** 縦型動画のURL(9:16推奨)。省略時はposterImageUrlのみの静止画カードになる。 */
  videoUrl?: string;
  /** 動画が無い場合の代替静止画、またはvideoのposter・ロード中/エラー時のフォールバック。 */
  posterImageUrl?: string;
  /** キャスト名など、投稿者アカウント表示(例: "@rena")。 */
  accountName: string;
  /** アイコン画像。無ければ頭文字のプレースホルダーを表示する。 */
  accountAvatarUrl?: string;
  /** 投稿者(キャスト)のプロフィールページURL。アイコン・アカウント名タップでここへ遷移する(Instagram/TikTok同様)。 */
  profileUrl: string;
  /** 店舗名(例: "Club Lounge X")。 */
  shopName: string;
  /** 投稿日時(ISO文字列)。指定するとアカウント情報の下にさりげなく表示する。 */
  createdAt?: string;
  /** 「詳しく見る」CTAの遷移先URL。 */
  ctaUrl: string;
  /** CTAボタンのラベル。省略時は「詳しく見る」。 */
  ctaText?: string;
  likesCount: number;
  liked?: boolean;
  onToggleLike?: () => void;
  commentsCount?: number;
  /** true: フォロー/お気に入り済み(アイコンの「+」バッジは非表示になる)。 */
  followed?: boolean;
  onToggleFollow?: () => void;
  /**
   * このカードが「今画面いっぱいに表示されているアクティブな1本」かどうか。
   * 親(ReelFeed)がIntersectionObserver 1本で一元管理し、常に1本だけがtrueになる
   * ように制御する(カード側で個別に判定させると二重再生の原因になるため)。
   */
  isActive: boolean;
  /** IntersectionObserverに登録するための参照コールバック(親から渡す)。 */
  containerRef?: (el: HTMLDivElement | null) => void;
  /**
   * trueのとき、9:16固定の角丸カードではなく親要素いっぱいに角丸なしで敷き詰める。
   * 全画面リールオーバーレイ(スマホ:100dvh、PC:h-[88vh]の枠いっぱい)で使う。
   */
  fullBleed?: boolean;
  /** システム管理者が投稿したPR(広告)カード。いいね等のエンゲージメントUIを出さず、代わりにPRバッジを表示する。 */
  isAd?: boolean;
};

export function ReelCard({
  reelId,
  castId,
  commentsEnabled = true,
  videoUrl,
  posterImageUrl,
  accountName,
  accountAvatarUrl,
  profileUrl,
  shopName,
  createdAt,
  ctaUrl,
  ctaText,
  likesCount,
  liked = false,
  onToggleLike,
  commentsCount,
  followed = false,
  onToggleFollow,
  isActive,
  containerRef,
  fullBleed = false,
  isAd = false,
}: ReelCardProps) {
  const { t } = useLocale();
  const resolvedCtaText = ctaText ?? t.common.learnMore;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    videoUrl ? "loading" : "ready",
  );
  const [shareCopied, setShareCopied] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  // トースト(「リンクをコピーしました」)を数秒後に自動で消す。
  useEffect(() => {
    if (!shareCopied) return;
    const timer = window.setTimeout(() => setShareCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [shareCopied]);

  async function handleShare() {
    const shareUrl = new URL(ctaUrl, window.location.origin).toString();
    const shareData = { title: `LOCAPASS | ${accountName}`, url: shareUrl };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // ユーザーがシェアをキャンセルした場合等は何もしない。
      }
      return;
    }

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareCopied(true);
      } catch {
        // クリップボード権限が無い環境等では何もしない。
      }
    }
  }

  // isActiveがfalseになった瞬間に<video>タグ自体をアンマウントするため(下のJSX参照)、
  // 非アクティブなカードはDOM上に<video>要素を一切持たない。
  // 再生開始・HLSアタッチ(Safariネイティブ/hls.js)・muted切り替え時のiOS再開は
  // すべてStreamVideo側で行う。

  return (
    <div
      ref={containerRef}
      className={`relative w-full transform-gpu will-change-transform ${
        fullBleed ? "h-full" : "aspect-[9/16] md:h-full md:w-auto"
      }`}
    >
      {/* 動画/画像そのものはここでrounded+overflow-hiddenにして角を切る。
          右側の縦アイコン列(PCでは動画の外側にはみ出す)はこの内側レイヤーの外に置き、
          ここでクリップされて消えてしまわないようにする。 */}
      <div
        className={`absolute inset-0 overflow-hidden bg-neutral-950 ${
          fullBleed ? "rounded-none" : "rounded-2xl"
        }`}
      >
      {videoUrl && isActive ? (
        <StreamVideo
          ref={videoRef}
          src={videoUrl}
          active={isActive}
          poster={sanitizeImageUrl(posterImageUrl)}
          className="h-full w-full object-contain"
          autoPlay
          playsInline
          muted={muted}
          loop
          preload="metadata"
          onLoadedData={() => setStatus("ready")}
          onWaiting={() => setStatus("loading")}
          onPlaying={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
      ) : posterImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sanitizeImageUrl(posterImageUrl)}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
        />
      ) : videoUrl ? (
        videoUrl.includes(".m3u8") ? (
          // posterが無いStream動画リール: HLSはsrc直指定で先頭フレームを描画できないため、
          // Streamのサムネイル画像エンドポイントを代わりに表示する(再生はしない)。
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={streamThumbnailFromManifestUrl(videoUrl)}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          // posterが無い動画リール: 再生はしないが<video>を静止表示し、
          // ブラウザに先頭フレームを自動描画させることでサムネイル代わりにする。
          // モバイルSafari等は#t=0.001を付けないと先頭フレームへシークせず
          // 真っ黒のままになることがあるため明示的に付与する。
          <video
            src={`${videoUrl}#t=0.001`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-600">
          {t.common.noMedia}
        </div>
      )}

      {/* 読み込み中/回線遅延時のフォールバック: サムネイルを重ねてスピナー表示(アクティブな1本のみ) */}
      {videoUrl && isActive && status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
          {posterImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sanitizeImageUrl(posterImageUrl)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
          )}
          {status === "loading" ? (
            <Loader2 className="relative z-10 animate-spin text-white/80" size={32} />
          ) : (
            <p className="relative z-10 text-xs text-white/70">{t.common.loadFailed}</p>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />

      {/* 再生中は画像中央部タップで指定リンク先へ(投稿の任意URL、無ければ既定のリンク先)。
          この後に続くボタン類はDOM順で上に来るため、それぞれのタップは奪わない。 */}
      {videoUrl && isActive && (
        <Link href={ctaUrl} aria-label={resolvedCtaText} className="absolute inset-0" />
      )}

      {videoUrl && (
        <button
          type="button"
          onClick={() => setMuted((v) => !v)}
          aria-label={muted ? t.common.unmute : t.common.mute}
          className="pointer-events-auto absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      )}

      {isAd && (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-black">
          PR
        </span>
      )}
      </div>

      {/* 右下: アイコン(プロフィールへ)・いいね・コメント・シェア (TikTok同様の並び)。
          PC(md以上)では動画の外側(右)に配置し、映像に被らないようにする。 */}
      <div className="pointer-events-auto absolute bottom-24 right-3 flex flex-col items-center gap-5 text-white md:bottom-28 md:right-[-64px]">
        <div className="relative">
          <AvatarPeek
            href={profileUrl}
            label={`${accountName}のプロフィールを見る`}
            prefetch={isActive}
          >
            {accountAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sanitizeImageUrl(accountAvatarUrl)}
                alt=""
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                className="h-10 w-10 rounded-full border-2 border-white object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-neutral-700 text-sm font-semibold">
                {accountName.slice(0, 1)}
              </div>
            )}
          </AvatarPeek>
          {onToggleFollow && !followed && (
            <button
              type="button"
              onClick={onToggleFollow}
              aria-label={`${accountName}をフォローする`}
              className="absolute -bottom-1.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-gold text-black ring-2 ring-black"
            >
              <Plus size={12} strokeWidth={3} />
            </button>
          )}
        </div>
        {!isAd && (
          <button type="button" onClick={onToggleLike} className="flex flex-col items-center gap-1">
            <Heart size={26} className={liked ? "fill-gold text-gold" : "text-white"} />
            <span className="text-[11px] drop-shadow">{likesCount}</span>
          </button>
        )}
        {reelId && (
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="flex flex-col items-center gap-1"
          >
            <MessageCircle size={26} />
            {commentsCount != null && <span className="text-[11px] drop-shadow">{commentsCount}</span>}
          </button>
        )}
        <button
          type="button"
          onClick={handleShare}
          className="relative flex flex-col items-center gap-1"
        >
          <Share2 size={24} />
          <span className="text-[11px] drop-shadow">{t.common.share}</span>
          {shareCopied && (
            <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs text-white shadow-lg">
              {t.common.linkCopied}
            </span>
          )}
        </button>
      </div>

      {/* 左下: CTA + アカウント情報 */}
      <div className="pointer-events-auto absolute bottom-4 left-3 right-16 space-y-2">
        <Link
          href={ctaUrl}
          className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur-md"
        >
          {resolvedCtaText} <span aria-hidden>▷</span>
        </Link>
        <Link href={profileUrl} className="block w-fit text-white drop-shadow">
          <p className="text-sm font-semibold">@{accountName}</p>
          <p className="text-xs text-white/80">
            {shopName}
            {createdAt && <span className="text-white/40"> · {formatPostedAt(createdAt)}</span>}
          </p>
        </Link>
      </div>

      {reelId && commentsOpen && (
        <ReelCommentSheet
          reelId={reelId}
          reelCastId={castId ?? null}
          commentsEnabled={commentsEnabled}
          onClose={() => setCommentsOpen(false)}
        />
      )}
    </div>
  );
}
