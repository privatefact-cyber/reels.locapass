import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPetViewer } from "@/lib/pet/db";
import { FOUND_KIND_LABEL, SPECIES_EMOJI, SPECIES_LABEL, getFoundReports } from "@/lib/pet/found";
import { foundTimeLabel } from "@/components/pet/FoundReportCard";
import { FoundActions } from "@/components/pet/FoundActions";
import { ShareButtons } from "@/components/pet/ShareButtons";
import { PetMap } from "@/components/pet/PetMap";
import { PetCard, PetSectionTitle } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shareText(r: { kind: "protected" | "sighted"; species: "dog" | "cat" | "other"; address: string | null }) {
  return `【迷子の${SPECIES_LABEL[r.species]}を${FOUND_KIND_LABEL[r.kind]}】${r.address ? `${r.address}付近` : ""} 飼い主さんを探しています。拡散お願いします #迷子犬 #ワンコ手帳`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "迷子のペット" };
  const [r] = await getFoundReports({ id });
  if (!r) return { title: "迷子のペット" };
  const title = `迷子の${SPECIES_LABEL[r.species]}を${FOUND_KIND_LABEL[r.kind]}`;
  return {
    title,
    description: shareText(r),
    robots: { index: false, follow: false },
    openGraph: { title, description: shareText(r), images: r.photoUrl ? [{ url: r.photoUrl }] : undefined },
    twitter: { card: r.photoUrl ? "summary_large_image" : "summary", title, description: shareText(r) },
  };
}

/** 「見つけました」通報の公開ページ(ログインなしで見られる・共有用) */
export default async function FoundDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ posted?: string }> }) {
  const { id } = await params;
  const { posted } = await searchParams;
  if (!UUID.test(id)) notFound();
  const viewer = await getPetViewer();
  const [r] = await getFoundReports({ id, viewerId: viewer?.userId });
  if (!r) notFound();
  const url = `https://locapass.net/pet/found/${r.id}`;

  return (
    <div className="pt-2">
      {posted !== undefined && r.isReporter && (
        <PetCard className="mb-4 bg-[#E5F7F0] text-sm font-bold text-[#22806A]">
          🙏 通報しました。{Number(posted) > 0 ? `近くの${posted}人に通知しました。` : ""}下のボタンでLINEやXにも広めてください。
        </PetCard>
      )}

      <div className="overflow-hidden rounded-[32px] border-2 border-[#BFE8DA] bg-white shadow-[0_6px_20px_-12px_rgba(40,120,90,0.4)]">
        {r.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.photoUrl} alt="" className="max-h-[420px] w-full object-cover" />
        ) : (
          <div className="flex h-48 items-center justify-center bg-[#E5F7F0] text-7xl">{SPECIES_EMOJI[r.species]}</div>
        )}
        <div className="p-4">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-extrabold text-white ${r.status === "resolved" ? "bg-[#9C8273]" : r.kind === "protected" ? "bg-[#2E9C7C]" : "bg-[#E0A800]"}`}>
            {r.status === "resolved" ? "🎉 解決しました" : FOUND_KIND_LABEL[r.kind]}
          </span>
          <h1 className="mt-2 text-xl font-extrabold">迷子の{SPECIES_LABEL[r.species]}を{FOUND_KIND_LABEL[r.kind]}</h1>
          <p className="mt-1 text-sm text-[#7A6050]">🕒 {foundTimeLabel(r.foundAt)} ごろ</p>
          {r.address && <p className="text-sm text-[#7A6050]">📍 {r.address}</p>}
          {r.features && <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-[#F6FBF9] px-3 py-2 text-sm text-[#5C4535]">{r.features}</p>}
          {r.handedTo && <p className="mt-2 text-sm font-bold text-[#22806A]">🏠 {r.handedTo}</p>}
          {r.contactNote && <p className="mt-1 text-sm text-[#5C4535]">💬 {r.contactNote}</p>}
        </div>
      </div>

      <div className="mt-4">
        <FoundActions id={r.id} isReporter={r.isReporter} loggedIn={Boolean(viewer)} resolved={r.status === "resolved"} />
      </div>

      {r.status === "open" && (
        <>
          <PetSectionTitle emoji="📣">みんなに広める</PetSectionTitle>
          <ShareButtons url={url} text={shareText(r)} />
        </>
      )}

      <PetSectionTitle emoji="🗺️">見つけた場所</PetSectionTitle>
      <PetMap markers={[{ id: r.id, lat: r.lat, lng: r.lng, kind: "found", imageUrl: r.photoUrl }]} height={220} />

      <p className="mt-6 text-center text-xs text-[#B39C8C]">
        うちの子が迷子のときは
        <Link href="/pet" className="ml-1 font-bold text-[#EE6A36] underline">
          ワンコ手帳
        </Link>
        で迷子のお知らせを出せます
      </p>
    </div>
  );
}
