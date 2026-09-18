import Link from "next/link";
import { UserRound } from "lucide-react";

export function CastCard({
  id,
  name,
  age,
  prText,
  photoUrl,
  shiftLabel,
  isNew = false,
  dense = false,
}: {
  id: string;
  name: string;
  age: number | null;
  prText: string | null;
  photoUrl?: string | null;
  shiftLabel?: string | null;
  /** 入店(登録)から2週間以内なら true。「NEW」バッジを出す。 */
  isNew?: boolean;
  /** Instagram風の詰めたグリッド用: 名前・PR文のオーバーレイを省き、写真そのものを見せる */
  dense?: boolean;
}) {
  return (
    <Link
      href={`/cast/${id}`}
      className={`group relative block aspect-[3/4] overflow-hidden border-amber-500/30 bg-gradient-to-br from-zinc-900 to-black transition hover:border-amber-400/60 hover:shadow-lg hover:shadow-amber-500/10 ${
        dense ? "border" : "rounded-2xl border"
      }`}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-950/40 via-zinc-900 to-black">
          <UserRound size={dense ? 24 : 36} strokeWidth={1.25} className="text-amber-500/40" />
        </div>
      )}

      {/* 写真下部のグラデーション(名前を読みやすくする) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/60 to-transparent" />

      {shiftLabel && (
        <span className="absolute bottom-2 left-2 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 px-2.5 py-1 text-[10px] font-bold text-zinc-950 shadow shadow-black/30">
          {shiftLabel}
        </span>
      )}

      {isNew && (
        <span className="absolute right-2 top-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow shadow-black/30">
          NEW
        </span>
      )}

      {!dense && (
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="font-display text-base font-semibold text-white">
            {name}
            {age != null && <span className="ml-1 text-xs font-normal text-white/60">({age})</span>}
          </h3>
          {prText && <p className="mt-0.5 line-clamp-1 text-[11px] text-amber-100/70">{prText}</p>}
        </div>
      )}
    </Link>
  );
}
