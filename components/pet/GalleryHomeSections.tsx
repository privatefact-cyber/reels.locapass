import Link from "next/link";
import { getLatestGallery, getTodayBirthdays, getWeeklyTop } from "@/lib/pet/gallery";
import { PetSectionTitle } from "./ui";

/** ホームの「きょうお誕生日」「今週の看板犬(なければ新着)」。ギャラリーに公開された写真だけを使う */
export async function GalleryHomeSections({ viewerId }: { viewerId: string | null }) {
  const [birthdays, top] = await Promise.all([getTodayBirthdays(viewerId), getWeeklyTop(viewerId, 6)]);
  const strip = top.length > 0 ? top : await getLatestGallery(viewerId, 10);
  const isTop = top.length > 0;

  return (
    <>
      {birthdays.length > 0 && (
        <>
          <PetSectionTitle emoji="🎂">きょうお誕生日</PetSectionTitle>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {birthdays.map((b) => (
              <Link key={b.id} href={`/pet/gallery/${b.id}`} className="relative w-28 shrink-0 overflow-hidden rounded-[20px] border-2 border-[#FFB4C8] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.imageUrls[0] && <img src={b.imageUrls[0]} alt="" className="aspect-square w-full object-cover" loading="lazy" />}
                <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 text-sm" aria-hidden>
                  🎉
                </span>
                <span className="block truncate px-2 py-1 text-center text-[11px] font-extrabold text-[#D0557A]">{b.pet.name}ちゃん おめでとう</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {strip.length > 0 && (
        <>
          <PetSectionTitle
            emoji={isTop ? "🏆" : "📸"}
            action={
              <Link href="/pet/gallery" className="text-xs font-bold text-[#EE6A36]">
                もっと見る
              </Link>
            }
          >
            {isTop ? "今週の看板犬" : "みんなのうちの子自慢"}
          </PetSectionTitle>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {strip.map((t, i) => (
              <Link key={t.id} href={`/pet/gallery/${t.id}`} className={`relative w-28 shrink-0 overflow-hidden rounded-[20px] border bg-white ${isTop && i < 3 ? "border-2 border-[#FCD34D]" : "border-[#F1E1CF]"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t.imageUrls[0] && <img src={t.imageUrls[0]} alt="" className="aspect-square w-full object-cover" loading="lazy" />}
                {isTop && i < 3 && (
                  <span className="absolute left-1.5 top-1.5 text-lg" aria-hidden>
                    {["🥇", "🥈", "🥉"][i]}
                  </span>
                )}
                <span className="block truncate px-2 py-1 text-[11px] font-extrabold">
                  {t.pet.name}
                  {t.likeCount > 0 && <span className="ml-1 text-[#EE6A36]">🐾{t.likeCount}</span>}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
