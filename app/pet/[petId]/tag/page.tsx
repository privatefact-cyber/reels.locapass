import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePetViewer } from "@/lib/pet/db";
import { getMyPets } from "@/lib/pet/queries";
import { QrTag } from "@/components/pet/QrTag";
import { PetCard, PetSectionTitle } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

export default async function PetTagPage({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const { supabase } = await requirePetViewer(`/pet/${petId}/tag`);
  const pet = (await getMyPets(supabase)).find((p) => p.id === petId);
  if (!pet) notFound();
  const url = `https://locapass.net/pet/t/${pet.tag_code}`;

  return (
    <div>
      <div className="mb-4 mt-2 px-1">
        <h1 className="text-2xl font-extrabold">名刺・迷子QRタグ</h1>
        <p className="mt-1 text-sm text-[#9C8273]">首輪のタグに付けたり、ワンコ友だちに見せて名刺交換に使えます。</p>
      </div>

      {!pet.card_public && (
        <PetCard className="mb-4 bg-[#FFF8E1] text-sm text-[#8A6A00]">
          いまは名刺ページを出さない設定です。QRを読んだ人には「見つかりません」と表示されます(迷子のお知らせ中は、迷子の情報だけ表示します)。
          <Link href={`/pet/${pet.id}?tab=profile`} className="ml-1 font-extrabold underline">
            設定を変える
          </Link>
        </PetCard>
      )}

      <QrTag url={url} name={pet.name} avatarUrl={pet.avatarUrl} />

      <PetSectionTitle emoji="🔎">QRを読んだ人に見えるもの</PetSectionTitle>
      <PetCard className="space-y-2 text-sm text-[#5C4535]">
        <p>
          <b>ふだん:</b> 名前・写真・犬種・年齢と「フォローする」ボタンだけ。住所や電話番号は出ません。
        </p>
        <p>
          <b>迷子のお知らせ中:</b> 「迷子です」の表示と、あなたが迷子のお知らせで入れた連絡先(電話・LINEなど)が出ます。見つかったら、お知らせを終わらせると連絡先は消えます。
        </p>
      </PetCard>

      <PetSectionTitle emoji="📍">AirTag(エアタグ)を使っている方へ</PetSectionTitle>
      <PetCard className="space-y-2 text-sm text-[#5C4535]">
        <p>
          首輪にAirTagを付けておくと、iPhoneの<b>「探す」アプリ</b>で、だいたいの場所を探せます。
        </p>
        <p className="text-xs text-[#9C8273]">
          AirTagの位置はAppleの「探す」アプリの中だけで見られる仕組みのため、ロカわんには表示できません。迷子のときは「探す」アプリで位置を確認しつつ、ロカわんの迷子のお知らせでご近所に協力をお願いしてください。
        </p>
      </PetCard>
    </div>
  );
}
