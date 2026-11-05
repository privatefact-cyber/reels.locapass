import type { Metadata } from "next";
import Link from "next/link";
import { getPetViewer } from "@/lib/pet/db";
import { getActiveLostReports, getLostFoundHeatPoints } from "@/lib/pet/lost";
import { getFoundReports } from "@/lib/pet/found";
import { getMyPets } from "@/lib/pet/queries";
import { FoundReportCard } from "@/components/pet/FoundReportCard";
import { LostInfoCard } from "@/components/pet/LostInfoCard";
import { SightingForm } from "@/components/pet/SightingForm";
import { ShareButtons } from "@/components/pet/ShareButtons";
import { FlagButton } from "@/components/pet/FlagButton";
import { NearbyControls } from "@/components/pet/NearbyControls";
import { PetMap, type PetMapMarker } from "@/components/pet/PetMap";
import { PetAvatar, PetCard, PetSectionTitle } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 30;
const RADII = [10, 30, 0] as const; // 0 = 全国

type Search = { report?: string; lat?: string; lng?: string; r?: string; limit?: string };

function lostShareText(r: { petName: string; breed: string | null; address: string | null }) {
  return `【迷子のワンコを探しています】${r.petName}${r.breed ? `(${r.breed})` : ""}${r.address ? ` ${r.address}付近` : ""} 見かけた方はご連絡ください。拡散お願いします #迷子犬 #ワンコ手帳`;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const { report } = await searchParams;
  if (!report || !UUID.test(report)) return { title: "迷子さがし" };
  const [r] = await getActiveLostReports({ reportId: report });
  if (!r) return { title: "迷子さがし" };
  const title = `迷子のワンコを探しています:${r.petName}`;
  const description = lostShareText(r);
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, images: r.photoUrl ? [{ url: r.photoUrl }] : undefined },
    twitter: { card: r.photoUrl ? "summary_large_image" : "summary", title, description },
  };
}

/** 迷子さがし: 近く(既定10km)の迷子のお知らせ・見つけました通報。全国はヒートマップで。選んだ子には「ここで見た!」を送れる。 */
export default async function PetLostMapPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const viewer = await getPetViewer();

  // ---- 1件を開いたとき(共有URLの行き先) ----
  if (sp.report) {
    const [selected] = UUID.test(sp.report) ? await getActiveLostReports({ reportId: sp.report, viewerId: viewer?.userId }) : [];
    if (!selected) {
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
        <PetSectionTitle emoji="📣">みんなに広める</PetSectionTitle>
        <ShareButtons url={`https://locapass.net/pet/lost?report=${selected.id}`} text={lostShareText(selected)} />
        <p className="mt-3 px-2 text-center text-xs text-[#B39C8C]">目撃情報は {selected.sightingCount}件 届いています</p>
        {!selected.isOwner && (
          <div className="mt-4">
            <FlagButton targetType="lost" targetId={selected.id} loggedIn={Boolean(viewer)} />
          </div>
        )}
      </div>
    );
  }

  // ---- 一覧(近くだけ) ----
  // 探す中心: URLの現在地 → 散歩エリア(1か所目) → なし(全国)
  let origin: { lat: number; lng: number; label: string } | null = null;
  const qLat = Number(sp.lat);
  const qLng = Number(sp.lng);
  if (sp.lat && sp.lng && Number.isFinite(qLat) && Number.isFinite(qLng) && Math.abs(qLat) <= 90 && Math.abs(qLng) <= 180) {
    origin = { lat: qLat, lng: qLng, label: "現在地" };
  } else if (viewer) {
    const { data: area } = await viewer.supabase.from("locapass_pet_walk_areas").select("lat, lng, label").order("created_at").limit(1).maybeSingle();
    if (area) origin = { lat: area.lat, lng: area.lng, label: area.label ? `散歩エリア(${area.label})` : "散歩エリア" };
  }
  const rParsed = Number(sp.r);
  const radius = (RADII as readonly number[]).includes(rParsed) ? rParsed : origin ? 10 : 0;
  const near = origin && radius > 0 ? { lat: origin.lat, lng: origin.lng, km: radius } : undefined;
  const limit = Math.min(300, Math.max(PAGE, Number(sp.limit) || PAGE));

  const [reports, found, heat, myPets] = await Promise.all([
    getActiveLostReports({ viewerId: viewer?.userId, near, limit: limit + 1 }),
    getFoundReports({ viewerId: viewer?.userId, near, limit: limit + 1 }),
    near ? Promise.resolve([]) : getLostFoundHeatPoints(),
    viewer ? getMyPets(viewer.supabase) : Promise.resolve([]),
  ]);
  const moreLost = reports.length > limit;
  const moreFound = found.length > limit;
  const lostList = reports.slice(0, limit);
  const foundList = found.slice(0, limit);

  const markers: PetMapMarker[] = [
    ...lostList
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => ({ id: r.id, lat: r.lat!, lng: r.lng!, kind: "lost" as const, label: r.petName, imageUrl: r.photoUrl, href: `/pet/lost?report=${r.id}` })),
    ...foundList.map((f) => ({ id: f.id, lat: f.lat, lng: f.lng, kind: "found" as const, label: "見つけました", imageUrl: f.photoUrl, href: `/pet/found/${f.id}` })),
  ];
  const moreHref = (n: number) => {
    const q = new URLSearchParams();
    if (sp.lat && sp.lng) {
      q.set("lat", sp.lat);
      q.set("lng", sp.lng);
    }
    q.set("r", String(radius));
    q.set("limit", String(n));
    return `/pet/lost?${q.toString()}`;
  };

  return (
    <div>
      <div className="mb-3 mt-2 px-1">
        <h1 className="text-2xl font-extrabold">迷子さがし</h1>
        <p className="mt-1 text-sm text-[#9C8273]">探している子・見つかった子の情報をみんなで共有します。</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/pet/found/new" className="rounded-[28px] bg-[#2E9C7C] p-4 text-white shadow-[0_5px_0_#22806A] active:translate-y-[2px]">
          <p className="text-3xl">🙋</p>
          <p className="mt-1 text-[15px] font-extrabold leading-tight">
            迷子のペットを
            <br />
            見つけました!
          </p>
          <p className="mt-1 text-[11px] opacity-90">写真と場所で通報</p>
        </Link>
        <Link href="#mine" className="rounded-[28px] bg-[#D04848] p-4 text-white shadow-[0_5px_0_#A83333] active:translate-y-[2px]">
          <p className="text-3xl">🚨</p>
          <p className="mt-1 text-[15px] font-extrabold leading-tight">
            うちの子が
            <br />
            迷子です
          </p>
          <p className="mt-1 text-[11px] opacity-90">近くの人に知らせる</p>
        </Link>
      </div>

      <div className="mt-4">
        <NearbyControls radius={radius} radii={[...RADII]} originLabel={origin?.label ?? null} />
      </div>

      {(markers.length > 0 || heat.length > 0) && (
        <div className="mt-2">
          <PetMap markers={markers} heatPoints={heat} height={300} center={origin} />
          <p className="mt-1 px-1 text-[11px] text-[#B39C8C]">
            🔴 探しています 🟢 見つけました{heat.length > 0 ? "(広く見ると多い場所が色で出ます)" : "(タップで詳細)"}
          </p>
        </div>
      )}

      <PetSectionTitle emoji="🚨">探しているワンコ({lostList.length}{moreLost ? "+" : ""})</PetSectionTitle>
      {lostList.length === 0 ? (
        <PetCard className="text-center">
          <p className="text-4xl">🌈</p>
          <p className="mt-2 text-sm font-bold">{near ? `${radius}km以内に` : "いま"}迷子のお知らせはありません</p>
          <p className="mt-1 text-xs text-[#9C8273]">散歩エリアを登録しておくと、近くで迷子が出たときに通知が届きます。</p>
          <Link href="/pet/settings" className="mt-3 inline-block text-sm font-extrabold text-[#EE6A36] underline">
            散歩エリアを登録する
          </Link>
        </PetCard>
      ) : (
        <div className="space-y-3">
          {lostList.map((r) => (
            <LostInfoCard key={r.id} report={r} />
          ))}
          {moreLost && (
            <Link href={moreHref(limit + PAGE)} scroll={false} className="block rounded-full bg-white py-3 text-center text-sm font-bold text-[#EE6A36]">
              もっと見る
            </Link>
          )}
        </div>
      )}

      <PetSectionTitle emoji="🙋">見つかった・保護された子({foundList.length}{moreFound ? "+" : ""})</PetSectionTitle>
      {foundList.length === 0 ? (
        <PetCard className="text-center text-sm text-[#9C8273]">ここ2週間の通報はありません</PetCard>
      ) : (
        <div className="space-y-2">
          {foundList.map((f) => (
            <FoundReportCard key={f.id} report={f} />
          ))}
          {moreFound && (
            <Link href={moreHref(limit + PAGE)} scroll={false} className="block rounded-full bg-white py-3 text-center text-sm font-bold text-[#2E9C7C]">
              もっと見る
            </Link>
          )}
        </div>
      )}

      <div id="mine" className="scroll-mt-20">
        <PetSectionTitle emoji="🐶">うちの子が迷子になったら</PetSectionTitle>
        {!viewer ? (
          <PetCard className="text-center text-sm">
            <Link href={`/mypage/login?redirect=${encodeURIComponent("/pet/lost#mine")}`} className="font-extrabold text-[#EE6A36] underline">
              ログイン
            </Link>
            して、うちの子を登録すると、迷子のお知らせを出せます。
          </PetCard>
        ) : myPets.length === 0 ? (
          <PetCard className="text-center text-sm">
            まず
            <Link href="/pet/new" className="mx-1 font-extrabold text-[#EE6A36] underline">
              うちの子を登録
            </Link>
            してください。
          </PetCard>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {myPets.map((p) => (
              <Link key={p.id} href={`/pet/${p.id}/lost`} className="block">
                <PetCard className={`flex flex-col items-center p-3 text-center ${p.is_lost ? "border-[#F5B5B5] bg-[#FFF5F5]" : ""}`}>
                  <PetAvatar url={p.avatarUrl} name={p.name} size={52} ring={false} />
                  <p className="mt-1 w-full truncate text-sm font-extrabold">{p.name}</p>
                  <p className={`text-[10px] font-bold ${p.is_lost ? "text-[#D04848]" : "text-[#B39C8C]"}`}>{p.is_lost ? "お知らせ中" : "お知らせを出す"}</p>
                </PetCard>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
