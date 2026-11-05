import Link from "next/link";
import { getPetViewer } from "@/lib/pet/db";
import { getActiveLostReports } from "@/lib/pet/lost";
import { LostInfoCard } from "@/components/pet/LostInfoCard";
import { SightingForm } from "@/components/pet/SightingForm";
import { PetMap, type PetMapMarker } from "@/components/pet/PetMap";
import { PetCard, PetSectionTitle } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 迷子さがし: 迷子のお知らせが出ている子の地図と一覧。選んだ子には「ここで見た!」を送れる。 */
export default async function PetLostMapPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const { report: selectedId } = await searchParams;
  const viewer = await getPetViewer();
  const reports = await getActiveLostReports({ viewerId: viewer?.userId });
  const selected = selectedId && UUID.test(selectedId) ? (reports.find((r) => r.id === selectedId) ?? null) : null;

  const markers: PetMapMarker[] = reports
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({ id: r.id, lat: r.lat!, lng: r.lng!, kind: "lost", label: r.petName, imageUrl: r.photoUrl, href: `/pet/lost?report=${r.id}` }));

  if (selectedId && !selected) {
    return (
      <div className="pt-12 text-center">
        <p className="text-5xl">🎉</p>
        <p className="mt-3 font-extrabold">この迷子のお知らせは終了しました</p>
        <p className="mt-1 text-sm text-[#9C8273]">無事に見つかったか、飼い主さんがお知らせを終えました。ご協力ありがとうございました。</p>
        <Link href="/pet/lost" className="mt-5 inline-block text-sm font-bold text-[#EE6A36] underline">
          ほかの迷子を見る
        </Link>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="pt-2">
        <LostInfoCard report={selected} showSightingLink={false} />
        {selected.isOwner ? (
          <PetCard className="mt-4 text-center text-sm">
            あなたの子のお知らせです。
            <Link href={`/pet/${selected.petId}/lost`} className="ml-1 font-extrabold text-[#EE6A36] underline">
              目撃情報を見る
            </Link>
          </PetCard>
        ) : (
          <div id="sighting" className="mt-4 scroll-mt-20">
            <SightingForm reportId={selected.id} petName={selected.petName} loggedIn={Boolean(viewer)} center={selected.lat != null && selected.lng != null ? { lat: selected.lat, lng: selected.lng } : null} />
          </div>
        )}
        <p className="mt-3 px-2 text-center text-xs text-[#B39C8C]">目撃情報は {selected.sightingCount}件 届いています</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 mt-2 px-1">
        <h1 className="text-2xl font-extrabold">迷子さがし</h1>
        <p className="mt-1 text-sm text-[#9C8273]">見かけたら「ここで見た!」で飼い主さんに知らせてください。</p>
      </div>
      {markers.length > 0 && <PetMap markers={markers} height={300} />}

      <PetSectionTitle emoji="🚨">探しているワンコ({reports.length})</PetSectionTitle>
      {reports.length === 0 ? (
        <PetCard className="text-center">
          <p className="text-4xl">🌈</p>
          <p className="mt-2 text-sm font-bold">いま迷子のお知らせはありません</p>
          <p className="mt-1 text-xs text-[#9C8273]">設定で散歩エリアを登録しておくと、近くで迷子が出たときに通知が届きます。</p>
          <Link href="/pet/settings" className="mt-3 inline-block text-sm font-extrabold text-[#EE6A36] underline">
            散歩エリアを登録する
          </Link>
        </PetCard>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <LostInfoCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}
