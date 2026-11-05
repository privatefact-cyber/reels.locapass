import type { Metadata } from "next";
import Link from "next/link";
import { getPetViewer, petAdmin, signPetImages } from "@/lib/pet/db";
import { ageLabel, formatJpDate } from "@/lib/pet/calc";
import { getActiveLostReports } from "@/lib/pet/lost";
import { SEX_LABEL, type PetDiaryRow, type PetSex, type PetVisibility } from "@/lib/pet/types";
import { LostInfoCard } from "@/components/pet/LostInfoCard";
import { PetFollowButton } from "@/components/pet/PetFollowButton";
import { PetAvatar, PetCard, PetSectionTitle, petButton } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "ワンコの名刺", robots: { index: false, follow: false } };

/**
 * 犬の名刺ページ(首輪のQR・名刺交換のQRの行き先)。ログインなしで開ける。
 * 出すのは許可した列だけ: 名前・写真・犬種・性別・年齢。迷子中は迷子情報と飼い主が公開を選んだ連絡先。
 * フォロワー(承認済み)・公開設定に応じて、プロフィールの続きと日誌も見せる。
 */
export default async function PetCardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const tag = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  const admin = petAdmin();
  const { data: pet } = await admin
    .from("locapass_pets")
    .select("id, owner_id, name, breed, sex, birthday, birthday_estimated, coat_color, avatar_path, cover_path, visibility, card_public, is_lost")
    .eq("tag_code", tag)
    .maybeSingle();

  const viewer = await getPetViewer();
  const lost = pet?.is_lost ? (await getActiveLostReports({ petId: pet.id, viewerId: viewer?.userId }))[0] ?? null : null;

  if (!pet || (!pet.card_public && !lost)) {
    return (
      <div className="pt-16 text-center">
        <p className="text-6xl">🐾</p>
        <p className="mt-4 font-extrabold">この名刺は見つかりませんでした</p>
        <p className="mt-1 text-sm text-[#9C8273]">飼い主さんが公開をやめたか、QRが古い可能性があります。</p>
        <Link href="/pet" className={`${petButton.soft} mt-6`}>
          ワンコ手帳を見る
        </Link>
      </div>
    );
  }

  if (!pet.card_public && lost) {
    return (
      <div className="pt-2">
        <LostInfoCard report={lost} />
      </div>
    );
  }

  const isOwner = viewer?.userId === pet.owner_id;
  const { data: follow } = viewer && !isOwner
    ? await admin.from("locapass_pet_follows").select("status").eq("pet_id", pet.id).eq("follower_id", viewer.userId).maybeSingle()
    : { data: null };
  const followStatus = (follow?.status as "pending" | "approved" | undefined) ?? null;
  const visibility = pet.visibility as PetVisibility;
  const canSeeMore = isOwner || visibility === "public" || (visibility === "followers" && followStatus === "approved");

  let diary: PetDiaryRow[] = [];
  if (canSeeMore) {
    const allowed: PetVisibility[] = isOwner ? ["private", "followers", "public"] : followStatus === "approved" ? ["followers", "public"] : ["public"];
    const { data } = await admin
      .from("locapass_pet_diary_entries")
      .select("id, pet_id, entry_date, weight_kg, body, image_paths, visibility, created_at")
      .eq("pet_id", pet.id)
      .in("visibility", allowed)
      .order("entry_date", { ascending: false })
      .limit(30);
    diary = (data ?? []) as PetDiaryRow[];
  }
  const { count: followerCount } = await admin.from("locapass_pet_follows").select("id", { count: "exact", head: true }).eq("pet_id", pet.id).eq("status", "approved");
  const signed = await signPetImages([pet.avatar_path, pet.cover_path, ...diary.flatMap((d) => d.image_paths)]);
  const avatarUrl = pet.avatar_path ? (signed.get(pet.avatar_path) ?? null) : null;
  const coverUrl = pet.cover_path ? (signed.get(pet.cover_path) ?? null) : null;
  const age = ageLabel(pet.birthday, pet.birthday_estimated);

  return (
    <div>
      {lost && (
        <div className="mb-4 mt-2">
          <LostInfoCard report={lost} />
        </div>
      )}

      <div className="relative -mx-4">
        <div
          className="h-40 rounded-b-[36px] bg-gradient-to-br from-[#FFD3B8] via-[#FFE7C2] to-[#CDEFE3]"
          style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        <div className="-mt-14 flex flex-col items-center px-4 text-center">
          <PetAvatar url={avatarUrl} name={pet.name} size={112} />
          <h1 className="mt-2 text-2xl font-extrabold">{pet.name}</h1>
          <p className="text-sm font-bold text-[#9C8273]">{[pet.breed, (pet.sex as PetSex) !== "unknown" ? SEX_LABEL[pet.sex as PetSex] : null, age].filter(Boolean).join(" ・ ")}</p>
          <p className="mt-1 text-xs text-[#B39C8C]">フォロワー {followerCount ?? 0}</p>
        </div>
      </div>

      <div className="mt-4">
        {isOwner ? (
          <Link href={`/pet/${pet.id}`} className={`${petButton.soft} w-full`}>
            これはあなたの子の名刺です(手帳を開く)
          </Link>
        ) : (
          <PetFollowButton petId={pet.id} petName={pet.name} initial={followStatus} loggedIn={Boolean(viewer)} back={`/pet/t/${tag}`} />
        )}
      </div>

      {canSeeMore && (
        <>
          {pet.coat_color && (
            <PetCard className="mt-4 text-sm">
              <span className="font-bold text-[#B39C8C]">毛色</span> {pet.coat_color}
            </PetCard>
          )}
          <PetSectionTitle emoji="📔">日誌</PetSectionTitle>
          {diary.length === 0 ? (
            <p className="px-1 text-sm text-[#9C8273]">まだ公開されている日誌はありません。</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {diary.map((d) => {
                const img = d.image_paths.map((p) => signed.get(p)).find(Boolean);
                return (
                  <PetCard key={d.id} className="overflow-hidden p-0">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-[#FFF3E6] text-3xl">📔</div>
                    )}
                    <div className="p-2.5">
                      <p className="text-[11px] font-bold text-[#B39C8C]">{formatJpDate(d.entry_date)}</p>
                      {d.body && <p className="line-clamp-2 text-xs text-[#5C4535]">{d.body}</p>}
                    </div>
                  </PetCard>
                );
              })}
            </div>
          )}
        </>
      )}

      {!viewer && (
        <PetCard className="mt-6 text-center">
          <p className="text-3xl" aria-hidden>
            🐕‍🦺
          </p>
          <p className="mt-1 font-extrabold">あなたのワンコも登録しませんか?</p>
          <p className="mt-1 text-xs text-[#9C8273]">ワクチン手帳・成長日誌・迷子タグが無料で使えます</p>
          <Link href={`/mypage/login?redirect=${encodeURIComponent("/pet")}`} className={`${petButton.primary} mt-3 w-full`}>
            無料で会員登録 / ログイン
          </Link>
        </PetCard>
      )}
    </div>
  );
}
