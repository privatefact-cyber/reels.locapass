type Attribution = { name?: string; uri?: string | null } | null | undefined;

/** cover_url がGoogle Places写真の中継URLか(=クレジット表示が必要か)。 */
export function isPlacePhotoUrl(url: string | null | undefined): boolean {
  return !!url && url.includes("/api/place-photo/");
}

// Googleの写真を表示するときは、撮影者クレジットを画像上に必ず出す(Google Maps Platform規約)。
export function PlacePhotoCredit({ attribution, className = "" }: { attribution: Attribution; className?: string }) {
  const name = attribution?.name || "Google Maps ユーザー";
  const label = (
    <>
      写真: {name} (Google)
    </>
  );
  return (
    <span
      className={`pointer-events-auto rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-none text-white/80 backdrop-blur-sm ${className}`}
    >
      {attribution?.uri ? (
        <a href={attribution.uri} target="_blank" rel="noopener noreferrer" className="hover:text-white">
          {label}
        </a>
      ) : (
        label
      )}
    </span>
  );
}
