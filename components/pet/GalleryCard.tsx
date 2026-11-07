import Link from "next/link";
import type { GalleryItem } from "@/lib/pet/gallery";
import { PawLikeButton } from "./PawLikeButton";
import { PetAvatar } from "./ui";

/** うちの子自慢ギャラリーの1枚(2列のグリッド用) */
export function GalleryCard({ item, loggedIn }: { item: GalleryItem; loggedIn: boolean }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-[#F1E1CF] bg-white shadow-[0_6px_20px_-14px_rgba(122,80,40,0.45)]">
      <Link href={`/pet/gallery/${item.id}`} className="relative block aspect-square bg-[#F4EEE8]">
        {item.imageUrls[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrls[0]} alt={`${item.pet.name}ちゃん`} className="h-full w-full object-cover" loading="lazy" />
        )}
        {item.imageUrls.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white">1/{item.imageUrls.length}</span>}
        {item.snap && (
          <span className="absolute left-2 top-2 max-w-[80%] truncate rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-extrabold text-[#2F6FAE]">📍 {item.snap.spotName ?? "snap"}</span>
        )}
        <span className="absolute bottom-2 right-2">
          <PawLikeButton entryId={item.id} initialLiked={item.liked} initialCount={item.likeCount} loggedIn={loggedIn} />
        </span>
      </Link>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <PetAvatar url={item.pet.avatarUrl} name={item.pet.name} size={28} ring={false} />
        <span className="min-w-0">
          <span className="block truncate text-xs font-extrabold text-[#4A3426]">{item.pet.name}</span>
          <span className="block truncate text-[10px] text-[#9C8273]">{[item.pet.breed, item.pet.age].filter(Boolean).join(" ・ ") || " "}</span>
        </span>
      </div>
    </div>
  );
}
