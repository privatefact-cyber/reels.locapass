import { PHOTO_WALL } from "@/lib/photowall/config";
import { buildWallTiles } from "@/lib/photowall/buildWall";
import type { PhotoWallPresetId } from "@/lib/photowall/presets";
import { photoResized } from "@/components/photo/photoUtils";

/**
 * 店舗ページの背景「写真の壁」。ポラロイド風の小さな写真を乱雑に貼った、押せない飾り。
 * 投稿写真が少ないうちはプリセットのダミー写真で埋め、投稿が増えるほど本物に押し出される。
 * 親要素は `relative isolate` にする(壁は親の背面に敷く)。見た目の調整値は lib/photowall/config.ts。
 */
export function PhotoWallBackground({ realPhotoUrls, preset }: { realPhotoUrls: string[]; preset: PhotoWallPresetId }) {
  const tiles = buildWallTiles(realPhotoUrls, preset);
  const partial = PHOTO_WALL.coverage < 1;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-0 left-1/2 -z-10 w-screen -translate-x-1/2 select-none overflow-hidden"
      style={{
        height: `${PHOTO_WALL.coverage * 100}%`,
        ...(partial ? { maskImage: "linear-gradient(to bottom, transparent, #000 90%)", WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 90%)" } : null),
      }}
    >
      <ul
        className="grid grid-cols-[repeat(10,minmax(0,1fr))] md:grid-cols-[repeat(14,minmax(0,1fr))] xl:grid-cols-[repeat(18,minmax(0,1fr))]"
        style={{ opacity: PHOTO_WALL.opacity, filter: `grayscale(${PHOTO_WALL.grayscale}) sepia(${PHOTO_WALL.sepia})` }}
      >
        {tiles.map((t, i) => (
          <li key={i} className="p-px">
            <div
              className="bg-white p-[3%] pb-[7%] shadow-sm"
              style={{ transform: `translate(${t.shiftX}%, ${t.shiftY}%) rotate(${t.rotate}deg) scale(${t.scale})` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.real ? photoResized(t.src, 120, true) : t.src}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full object-cover"
                style={{ aspectRatio: t.aspect }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="absolute inset-0 bg-page" style={{ opacity: PHOTO_WALL.overlay }} />
    </div>
  );
}
