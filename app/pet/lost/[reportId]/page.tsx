import type { Metadata } from "next";
import Link from "next/link";
import { getPetViewer } from "@/lib/pet/db";
import { getActiveLostReports } from "@/lib/pet/lost";
import { LostInfoCard } from "@/components/pet/LostInfoCard";
import { SightingForm } from "@/components/pet/SightingForm";
import { ShareButtons } from "@/components/pet/ShareButtons";
import { FlagButton } from "@/components/pet/FlagButton";
import { PetMap } from "@/components/pet/PetMap";
import { PetCard, PetSectionTitle } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lostShareText(r: { petName: string; breed: string | null; address: string | null }) {
  return `【迷子のワンコを探しています】${r.petName}${r.breed ? `(${r.breed})` : ""}${r.address ? ` ${r.address}付近` : ""} 見かけた方はご連絡ください。拡散お願いします #迷子犬 #ワンコ手帳`;
}

export async function generateMetadata({ params }: { params: Promise<{ reportId: string }> }): Promise<Metadata> {
  const { reportId } = await params;
  const [r] = UUID.test(reportId) ? await getActiveLostReports({ reportId }) : [];
  if (!r) return { title: "迷子のお知らせ", robots: { index: false, follow: false } };
  const title = `迷子のワンコを探しています:${r.petName}${r.address ? `(${r.address})` : ""}`;
  const description = lostShareText(r);
  return {
    title,
    description,
    // お知らせ中だけ検索に出す。連絡先はHTMLに載せていない(ボタンを押したときだけ表示)
    robots: { index: true, follow: true },
    alternates: { canonical: `https://locapass.net/pet/lost/${r.id}` },
    openGraph: { title, description, images: r.photoUrl ? [{ url: r.photoUrl }] : undefined },
    twitter: { card: r.photoUrl ? "summary_large_image" : "summary", title, description },
  };
}

/** 迷子のお知らせ1件(共有URL・検索の行き先)。ログインなしでも見られ、「ここで見た!」も送れる */
export default async function LostReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const viewer = await getPetViewer();
  const [r] = UUID.test(reportId) ? await getActiveLostReports({ reportId, viewerId: viewer?.userId }) : [];

  if (!r) {
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

  return (
    <div className="pt-2">
      <LostInfoCard report={r} showSightingLink={false} />
      {r.lat != null && r.lng != null && (
        <div className="mt-3">
          <PetMap markers={[{ id: r.id, lat: r.lat, lng: r.lng, kind: "lost", imageUrl: r.photoUrl, label: "最後に見た場所" }]} height={200} />
        </div>
      )}
      {r.isOwner ? (
        <PetCard className="mt-4 text-center text-sm">
          あなたの子のお知らせです。
          <Link href={`/pet/${r.petId}/lost`} className="ml-1 font-extrabold text-[#EE6A36] underline">
            目撃情報を見る
          </Link>
        </PetCard>
      ) : (
        <div id="sighting" className="mt-4 scroll-mt-20">
          <SightingForm reportId={r.id} petName={r.petName} loggedIn={Boolean(viewer)} center={r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null} />
        </div>
      )}
      <PetSectionTitle emoji="📣">みんなに広める</PetSectionTitle>
      <ShareButtons url={`https://locapass.net/pet/lost/${r.id}`} text={lostShareText(r)} />
      <p className="mt-3 px-2 text-center text-xs text-[#B39C8C]">目撃情報は {r.sightingCount}件 届いています</p>
      {!r.isOwner && (
        <div className="mt-4">
          <FlagButton targetType="lost" targetId={r.id} loggedIn={Boolean(viewer)} />
        </div>
      )}
      <p className="mt-6 text-center text-xs text-[#B39C8C]">
        <Link href="/pet/lost" className="font-bold text-[#EE6A36] underline">
          ほかの迷子・見つかった子を見る
        </Link>
      </p>
    </div>
  );
}
