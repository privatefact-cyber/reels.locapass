type Attribution = { name?: string; uri?: string | null } | null | undefined;

/** cover_url がGoogle Places写真の中継URLか(=クレジット表示が必要か)。 */
export function isPlacePhotoUrl(url: string | null | undefined): boolean {
  return !!url && url.includes("/api/place-photo/");
}

// Googleの写真を表示するときは、撮影者クレジットを画像上に必ず出す(Google Maps Platform規約)。
export function PlacePhotoCredit({
  attribution,
  className = "",
  linked = true,
}: {
  attribution: Attribution;
  className?: string;
  /** false: 撮影者リンクを付けず文字だけ表示する。カード全体がリンク/タップ対象の中に置くときに使う(aの入れ子・誤タップ防止)。 */
  linked?: boolean;
}) {
  const name = attribution?.name || "Google Maps ユーザー";
  const label = (
    <>
      写真: {name} (Google)
    </>
  );
  return (
    <span data-surface="media"
      className={`pointer-events-auto rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-none text-main/80 backdrop-blur-sm ${className}`}
    >
      {linked && attribution?.uri ? (
        <a href={attribution.uri} target="_blank" rel="noopener noreferrer" className="hover:text-main">
          {label}
        </a>
      ) : (
        label
      )}
    </span>
  );
}
