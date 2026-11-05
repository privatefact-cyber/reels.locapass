import Link from "next/link";
import { QrCode } from "lucide-react";
import { petAdmin, requirePetViewer, signPetImages } from "@/lib/pet/db";
import { getMyPets } from "@/lib/pet/queries";
import { FollowRespondButtons } from "@/components/pet/FollowRespondButtons";
import { PetAvatar, PetCard, PetSectionTitle } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

export default async function PetFollowsPage() {
  const { supabase, userId } = await requirePetViewer("/pet/follows");
  const admin = petAdmin();
  const myPets = await getMyPets(supabase);
  const myPetById = new Map(myPets.map((p) => [p.id, p]));

  const [{ data: incoming }, { data: outgoing }] = await Promise.all([
    myPets.length
      ? admin.from("locapass_pet_follows").select("id, pet_id, follower_id, status, created_at").in("pet_id", myPets.map((p) => p.id)).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; pet_id: string; follower_id: string; status: string; created_at: string }[] }),
    admin.from("locapass_pet_follows").select("id, pet_id, status, created_at").eq("follower_id", userId).order("created_at", { ascending: false }),
  ]);

  const memberIds = [...new Set((incoming ?? []).map((f) => f.follower_id as string))];
  const { data: members } = memberIds.length ? await admin.from("locapass_members").select("id, nickname, avatar_url").in("id", memberIds) : { data: [] };
  const memberById = new Map((members ?? []).map((m) => [m.id as string, m as { id: string; nickname: string | null; avatar_url: string | null }]));

  const followedIds = (outgoing ?? []).map((f) => f.pet_id as string);
  const { data: followedPets } = followedIds.length ? await admin.from("locapass_pets").select("id, name, breed, avatar_path, tag_code, card_public").in("id", followedIds) : { data: [] };
  const signed = await signPetImages((followedPets ?? []).map((p) => p.avatar_path as string | null));
  const followedById = new Map((followedPets ?? []).map((p) => [p.id as string, p]));

  const requests = (incoming ?? []).filter((f) => f.status === "pending");
  const followers = (incoming ?? []).filter((f) => f.status === "approved");

  const Person = ({ id }: { id: string }) => {
    const m = memberById.get(id);
    return (
      <span className="flex min-w-0 items-center gap-2">
        {m?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F4EEE8] text-sm">👤</span>
        )}
        <span className="truncate text-sm font-bold">{m?.nickname || "ゲスト"}さん</span>
      </span>
    );
  };

  return (
    <div>
      <div className="mb-3 mt-2 px-1">
        <h1 className="text-2xl font-extrabold">ワンコ友だち</h1>
        <p className="mt-1 text-sm text-[#9C8273]">お散歩仲間とQRで名刺交換。フォローは飼い主さんの承認制です。</p>
      </div>

      {myPets.length > 0 && (
        <PetCard className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFEBDD] text-[#EE6A36]">
            <QrCode size={22} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-extrabold">名刺交換のしかた</p>
            <p className="text-xs text-[#9C8273]">相手の子のQRをスマホのカメラで読むと、フォローできます。うちの子のQRはここから。</p>
          </div>
          <Link href={`/pet/${myPets[0].id}/tag`} className="shrink-0 rounded-full bg-[#FF8E5E] px-3 py-2 text-xs font-extrabold text-white">
            QRを出す
          </Link>
        </PetCard>
      )}

      {requests.length > 0 && (
        <>
          <PetSectionTitle emoji="💌">フォローの申請({requests.length})</PetSectionTitle>
          <PetCard className="divide-y divide-[#F6EBDF] p-0">
            {requests.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <Person id={f.follower_id} />
                  <p className="mt-0.5 pl-11 text-xs text-[#B39C8C]">→ {myPetById.get(f.pet_id)?.name}ちゃん</p>
                </div>
                <FollowRespondButtons followId={f.id} mode="request" />
              </div>
            ))}
          </PetCard>
        </>
      )}

      <PetSectionTitle emoji="💛">フォロー中のワンコ</PetSectionTitle>
      {(outgoing ?? []).length === 0 ? (
        <PetCard className="text-center text-sm text-[#9C8273]">まだいません。お散歩で会った子のQRを読んでみましょう 🐾</PetCard>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {(outgoing ?? []).map((f) => {
            const p = followedById.get(f.pet_id);
            if (!p) return null;
            const avatar = p.avatar_path ? (signed.get(p.avatar_path) ?? null) : null;
            return (
              <Link key={f.id} href={`/pet/t/${p.tag_code}`} className="block">
                <PetCard className="flex flex-col items-center p-3 text-center">
                  <PetAvatar url={avatar} name={p.name} size={56} ring={false} />
                  <p className="mt-1 w-full truncate text-sm font-extrabold">{p.name}</p>
                  <p className={`text-[10px] font-bold ${f.status === "approved" ? "text-[#4FBF9F]" : "text-[#B39C8C]"}`}>{f.status === "approved" ? "フォロー中" : "承認待ち"}</p>
                </PetCard>
              </Link>
            );
          })}
        </div>
      )}

      {myPets.length > 0 && (
        <>
          <PetSectionTitle emoji="🐾">うちの子のフォロワー({followers.length})</PetSectionTitle>
          {followers.length === 0 ? (
            <PetCard className="text-center text-sm text-[#9C8273]">まだいません</PetCard>
          ) : (
            <PetCard className="divide-y divide-[#F6EBDF] p-0">
              {followers.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <Person id={f.follower_id} />
                    <p className="mt-0.5 pl-11 text-xs text-[#B39C8C]">→ {myPetById.get(f.pet_id)?.name}ちゃん</p>
                  </div>
                  <FollowRespondButtons followId={f.id} mode="follower" />
                </div>
              ))}
            </PetCard>
          )}
        </>
      )}
    </div>
  );
}
