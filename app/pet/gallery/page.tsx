import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Heart } from "lucide-react";
import { getPetViewer } from "@/lib/pet/db";
import { getGallery, getGalleryBreeds, getWeeklyTop, type GallerySort } from "@/lib/pet/gallery";
import { GalleryCard } from "@/components/pet/GalleryCard";
import { PetCard, PetSectionTitle, petButton } from "@/components/pet/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "うちの子自慢ギャラリー",
  description: "ロカわんの飼い主さんが自慢のうちの子を投稿するギャラリー。肉球を送って応援しよう。",
  // 写真は期限付きURLなので検索には出さない
  robots: { index: false, follow: true },
};

export default async function PetGalleryPage({ searchParams }: { searchParams: Promise<{ sort?: string; breed?: string; page?: string }> }) {
  const sp = await searchParams;
  const sort: GallerySort = sp.sort === "popular" ? "popular" : "new";
  const breed = sp.breed?.trim().slice(0, 40) || null;
  const page = Math.max(0, Number(sp.page) || 0);
  const viewer = await getPetViewer();
  const viewerId = viewer?.userId ?? null;
  const [{ items, hasMore }, breeds, top] = await Promise.all([
    getGallery({ sort, breed, page, viewerId }),
    getGalleryBreeds(),
    page === 0 && !breed && sort === "new" ? getWeeklyTop(viewerId) : Promise.resolve([]),
  ]);
  const href = (q: { sort?: GallerySort; breed?: string | null; page?: number }) => {
    const p = new URLSearchParams();
    const s = q.sort ?? sort;
    const b = q.breed === undefined ? breed : q.breed;
    if (s !== "new") p.set("sort", s);
    if (b) p.set("breed", b);
    if (q.page) p.set("page", String(q.page));
    const qs = p.toString();
    return `/pet/gallery${qs ? `?${qs}` : ""}`;
  };
  const chip = (active: boolean) => `shrink-0 rounded-full border-2 px-3 py-1.5 text-xs font-bold ${active ? "border-[#FF8E5E] bg-[#FFEBDD] text-[#C2562A]" : "border-[#F1E1CF] bg-white text-[#9C8273]"}`;

  return (
    <div className="pt-2">
      <div className="flex items-end justify-between px-1">
        <div>
          <p className="text-xs font-bold text-[#B39C8C]">みんなの</p>
          <h1 className="text-2xl font-extrabold">うちの子自慢</h1>
        </div>
        <div className="flex gap-1.5">
          {viewer && (
            <Link href="/pet/follows" className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#7A6050] shadow-sm">
              <Heart size={14} />
              フォロー
            </Link>
          )}
          <Link href="/pet/post" className={petButton.soft}>
            <Camera size={16} />
            投稿
          </Link>
        </div>
      </div>

      {top.length > 0 && (
        <>
          <PetSectionTitle emoji="🏆">今週の看板犬</PetSectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {top.map((t, i) => (
              <Link key={t.id} href={`/pet/gallery/${t.id}`} className="relative block overflow-hidden rounded-[20px] border-2 border-[#FCD34D] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t.imageUrls[0] && <img src={t.imageUrls[0]} alt="" className="aspect-square w-full object-cover" />}
                <span className="absolute left-1.5 top-1.5 text-lg" aria-hidden>
                  {["🥇", "🥈", "🥉"][i]}
                </span>
                <span className="block truncate px-2 py-1 text-[11px] font-extrabold">
                  {t.pet.name} <span className="text-[#EE6A36]">🐾{t.likeCount}</span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="-mx-4 mt-5 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <Link href={href({ sort: "new", page: 0 })} className={chip(sort === "new")}>
          🆕 新着
        </Link>
        <Link href={href({ sort: "popular", page: 0 })} className={chip(sort === "popular")}>
          🐾 人気
        </Link>
        {breed && (
          <Link href={href({ breed: null, page: 0 })} className={chip(true)}>
            {breed} ✕
          </Link>
        )}
        {breeds
          .filter((b) => b !== breed)
          .slice(0, 12)
          .map((b) => (
            <Link key={b} href={href({ breed: b, page: 0 })} className={chip(false)}>
              {b}
            </Link>
          ))}
      </div>

      {items.length === 0 ? (
        <PetCard className="mt-3 text-center">
          <p className="text-4xl" aria-hidden>
            📸
          </p>
          <p className="mt-2 font-extrabold">{breed ? `${breed}の投稿はまだありません` : "まだ投稿はありません"}</p>
          <p className="mt-1 text-xs text-[#9C8273]">成長日誌に写真を付けて「公開」にすると、ここに並びます。</p>
          <Link href="/pet/post" className={`${petButton.primary} mt-3 w-full`}>
            最初の1枚を投稿する
          </Link>
        </PetCard>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {items.map((it) => (
            <GalleryCard key={it.id} item={it} loggedIn={Boolean(viewer)} />
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-center gap-2">
        {page > 0 && (
          <Link href={href({ page: page - 1 })} className={petButton.soft}>
            前へ
          </Link>
        )}
        {hasMore && (
          <Link href={href({ page: page + 1 })} className={petButton.soft}>
            もっと見る
          </Link>
        )}
      </div>
    </div>
  );
}
