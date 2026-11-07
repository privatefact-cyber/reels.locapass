import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin } from "lucide-react";
import { getPetViewer } from "@/lib/pet/db";
import { getGalleryItem } from "@/lib/pet/gallery";
import { formatJpDate } from "@/lib/pet/calc";
import { PawLikeButton } from "@/components/pet/PawLikeButton";
import { FlagButton } from "@/components/pet/FlagButton";
import { ShareButtons } from "@/components/pet/ShareButtons";
import { PetAvatar, PetCard, petButton } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const item = UUID.test(id) ? await getGalleryItem(id, null) : null;
  return { title: item ? `${item.pet.name}ちゃん | うちの子自慢` : "うちの子自慢", robots: { index: false, follow: true } };
}

/** うちの子自慢の1件。位置は出さない(snapにも投稿したものだけ、snapへの入口を出す) */
export default async function PetGalleryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const viewer = await getPetViewer();
  const item = await getGalleryItem(id, viewer?.userId ?? null);
  if (!item) notFound();
  const isOwner = viewer?.userId === item.ownerId;
  const shareUrl = `https://locapass.net/pet/gallery/${item.id}`;

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2.5 px-1">
        <PetAvatar url={item.pet.avatarUrl} name={item.pet.name} size={44} ring={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold">
            {item.pet.name}
            {item.pet.sex !== "unknown" && <span className={`ml-1 text-sm ${item.pet.sex === "male" ? "text-[#6AADEB]" : "text-[#FF8FAB]"}`}>{item.pet.sex === "male" ? "♂" : "♀"}</span>}
          </p>
          <p className="truncate text-xs text-[#9C8273]">{[item.pet.breed, item.pet.age].filter(Boolean).join(" ・ ")}</p>
        </div>
        {item.pet.cardCode && (
          <Link href={`/pet/t/${item.pet.cardCode}`} className={petButton.soft}>
            この子を見る
          </Link>
        )}
      </div>

      <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-1 overflow-x-auto">
        {item.imageUrls.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={u} alt={`${item.pet.name}ちゃん`} className="aspect-square w-full shrink-0 snap-center object-cover" />
        ))}
      </div>
      {item.imageUrls.length > 1 && <p className="mt-1 text-center text-[11px] text-[#B39C8C]">← 横にスワイプ({item.imageUrls.length}枚) →</p>}

      <div className="mt-3 flex items-center justify-between px-1">
        <PawLikeButton entryId={item.id} initialLiked={item.liked} initialCount={item.likeCount} loggedIn={Boolean(viewer)} size="lg" />
        <p className="text-xs text-[#B39C8C]">{formatJpDate(item.createdAt.slice(0, 10))}</p>
      </div>
      {item.body && <p className="mt-2 whitespace-pre-wrap px-1 text-sm leading-relaxed text-[#5C4535]">{item.body}</p>}

      {item.snap && (
        <Link href={`/photo/p/${item.snap.id}`} className="mt-4 flex items-center gap-3 rounded-[22px] border border-[#CFE3F7] bg-[#F2F8FE] p-3">
          <MapPin className="shrink-0 text-[#2F6FAE]" size={22} />
          <span className="min-w-0 flex-1 text-sm">
            <b className="block truncate text-[#2F6FAE]">{item.snap.spotName ?? "撮影した場所"}で撮影</b>
            <span className="text-xs text-[#6B8AA8]">LOCAPASS snap で場所を見る</span>
          </span>
          <ChevronRight className="shrink-0 text-[#9DBBD8]" size={18} />
        </Link>
      )}

      <div className="mt-5">
        <ShareButtons url={shareUrl} text={`${item.pet.name}ちゃんを見て! #ロカわん #うちの子自慢`} />
      </div>

      <PetCard className="mt-5 flex items-center gap-3 bg-[#FFF3E6]">
        <span className="text-3xl" aria-hidden>
          📸
        </span>
        <span className="min-w-0 flex-1 text-xs text-[#7A6050]">
          <b className="block text-sm text-[#4A3426]">うちの子も自慢しよう</b>
          成長日誌に写真を付けて「公開」にするだけ
        </span>
        <Link href={viewer ? "/pet/post" : `/pet/login?redirect=${encodeURIComponent("/pet/post")}`} className={petButton.soft}>
          投稿
        </Link>
      </PetCard>

      <div className="mt-6 flex items-center justify-between">
        <Link href="/pet/gallery" className="text-xs font-bold text-[#EE6A36]">
          ‹ ギャラリーへ
        </Link>
        {!isOwner && <FlagButton targetType="diary" targetId={item.id} loggedIn={Boolean(viewer)} />}
      </div>
    </div>
  );
}
