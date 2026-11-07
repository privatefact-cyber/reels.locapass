import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, ExternalLink, Info } from "lucide-react";
import { PLACE_CATEGORY_EMOJI, PLACE_CATEGORY_LABEL, getNearbySnaps, getPetPlace, getPetSpotsInBounds } from "@/lib/pet/spots";
import { photoResized } from "@/components/photo/photoUtils";
import { PetMap } from "@/components/pet/PetMap";
import { PetCard, PetSectionTitle, petButton } from "@/components/pet/ui";
import { VerifiedBadge } from "@/components/pet/VerifiedBadge";
import { ReturnLink } from "@/components/pet/ReturnLink";
import { AddressFromPoint } from "@/components/pet/AddressFromPoint";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = UUID.test(id) ? await getPetPlace(id) : null;
  return { title: p ? `${p.name}(${PLACE_CATEGORY_LABEL[p.category]})` : "施設", robots: { index: false, follow: false } };
}

/**
 * 取り込んだ施設(ドッグラン・動物病院など)のページ。LOCAPASSの地図には出さず、ロカわんの中だけ。
 * ここでLOCAPASSへつなぐ: 近くで投稿された LOCAPASS snap / 近くの LOCAPASS認証のお店 / snapへの投稿のすすめ / 施設の掲載案内。
 */
export default async function PetPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const place = await getPetPlace(id);
  if (!place) notFound();

  const d = 0.02; // 約2km
  const [snaps, { spots }] = await Promise.all([
    getNearbySnaps(place.lat, place.lng, 12),
    getPetSpotsInBounds({ minLat: place.lat - d, maxLat: place.lat + d, minLng: place.lng - d * 1.25, maxLng: place.lng + d * 1.25 }),
  ]);
  const nearbyShops = spots.filter((s) => s.verified).slice(0, 6);
  const self = `/pet/place/${place.id}`;

  return (
    <div className="pt-2">
      <div className="flex items-center gap-3">
        <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-3xl ${place.category === "dog_run" ? "bg-[#E5F7F0]" : "bg-[#E8F3FD]"}`}>{PLACE_CATEGORY_EMOJI[place.category]}</span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#9C8273]">{PLACE_CATEGORY_LABEL[place.category]}</p>
          <h1 className="text-xl font-extrabold leading-tight">{place.name}</h1>
          <p className="mt-0.5 text-xs text-[#7A6050]">📍 {place.address ?? <AddressFromPoint lat={place.lat} lng={place.lng} />}</p>
        </div>
      </div>

      <div className="mt-3">
        <PetMap markers={[{ id: place.id, lat: place.lat, lng: place.lng, kind: "shop", label: place.name }]} height={200} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <a href={`https://maps.apple.com/?ll=${place.lat},${place.lng}&q=${encodeURIComponent(place.name)}`} target="_blank" rel="noreferrer" className={petButton.soft}>
          <ExternalLink size={14} />
          地図アプリで開く
        </a>
        {place.website && (
          <a href={place.website} target="_blank" rel="noreferrer nofollow" className={petButton.soft}>
            <ExternalLink size={14} />
            公式サイト
          </a>
        )}
      </div>
      {place.opening_hours && <p className="mt-2 px-1 text-xs text-[#7A6050]">🕒 {place.opening_hours}</p>}
      <p className="mt-2 flex items-start gap-1 px-1 text-[11px] leading-relaxed text-[#B39C8C]">
        <Info size={12} className="mt-0.5 shrink-0" />
        この施設の情報は {place.attribution ?? "外部のデータ"} によるもので、営業状況はLOCAPASSでは確認できていません。お出かけ前に施設へご確認ください。
      </p>

      {/* LOCAPASS snap へ */}
      <Link href="/photo/new" className="mt-4 flex items-center gap-3 rounded-[24px] bg-[#FF8E5E] p-4 text-white shadow-[0_4px_0_#EE6A36] active:translate-y-[2px]">
        <Camera size={26} className="shrink-0" />
        <span className="text-sm leading-snug">
          <b className="block text-base">ここで遊んだ?写真を投稿</b>
          LOCAPASS snap に投稿すると、このページにも並びます
        </span>
      </Link>

      <PetSectionTitle emoji="📸">ここで撮られた LOCAPASS snap</PetSectionTitle>
      {snaps.length === 0 ? (
        <PetCard className="text-center text-sm text-[#9C8273]">まだ投稿はありません。最初の1枚を投稿してみませんか?</PetCard>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {snaps.map((p) => (
            <ReturnLink key={p.id} href={`/photo/p/${p.id}`} backTo={self} className="relative block aspect-square overflow-hidden rounded-2xl bg-[#F4EEE8]">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoResized(p.image_url, 240, true)} alt={p.spot_name ?? ""} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full items-center justify-center text-2xl">🎬</span>
              )}
            </ReturnLink>
          ))}
        </div>
      )}

      {nearbyShops.length > 0 && (
        <>
          <PetSectionTitle emoji="🐾">近くのワンコOKなお店</PetSectionTitle>
          <div className="space-y-2">
            {nearbyShops.map((s) => (
              <ReturnLink key={s.id} href={s.href} backTo={self} className="flex items-center gap-3 rounded-[22px] border border-[#FCD34D] bg-gradient-to-r from-[#FFFBEB] to-white p-2.5">
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFF3E6] text-2xl">🐾</span>
                )}
                <span className="min-w-0 flex-1">
                  <VerifiedBadge />
                  <span className="mt-0.5 block truncate text-sm font-extrabold text-[#4A3426]">{s.name}</span>
                  <span className="block truncate text-xs text-[#9C8273]">{[s.area, s.category].filter(Boolean).join(" ・ ")}</span>
                </span>
              </ReturnLink>
            ))}
          </div>
        </>
      )}

      <PetCard className="mt-6 space-y-2 bg-[#FFFBEB] text-sm text-[#7A6050]">
        <p className="flex items-center gap-2 font-extrabold text-[#4A3426]">
          この施設の方へ <VerifiedBadge />
        </p>
        <p className="text-xs leading-relaxed">LOCAPASSに無料で掲載すると「LOCAPASS認証」マークが付き、写真や動画(リール)で施設の魅力を発信できます。</p>
        <a href="/lp/shop" className="inline-block text-xs font-extrabold text-[#EE6A36] underline">
          掲載について見る
        </a>
      </PetCard>
    </div>
  );
}
