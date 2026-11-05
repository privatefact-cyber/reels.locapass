import { notFound } from "next/navigation";
import { requirePetViewer, petAdmin, signPetImages } from "@/lib/pet/db";
import { getMyPets } from "@/lib/pet/queries";
import type { PetLostReportRow } from "@/lib/pet/types";
import { getFoundReports } from "@/lib/pet/found";
import { FoundReportCard } from "@/components/pet/FoundReportCard";
import { LostReportForm } from "@/components/pet/LostReportForm";
import { ResolveLostButtons } from "@/components/pet/ResolveLostButtons";
import { PetMap, type PetMapMarker } from "@/components/pet/PetMap";
import { PetCard, PetSectionTitle } from "@/components/pet/ui";
import { ShareButtons } from "@/components/pet/ShareButtons";
import { ConfirmLostButton } from "@/components/pet/ConfirmLostButton";
import { LOST_AUTO_CLOSE_DAYS } from "@/lib/pet/housekeeping";

export const dynamic = "force-dynamic";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function PetLostOwnerPage({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const { supabase } = await requirePetViewer(`/pet/${petId}/lost`);
  const pet = (await getMyPets(supabase)).find((p) => p.id === petId);
  if (!pet) notFound();

  const { data: reportRow } = await supabase.from("locapass_pet_lost_reports").select("*").eq("pet_id", pet.id).eq("status", "active").maybeSingle();
  const report = reportRow as (PetLostReportRow & { last_confirmed_at: string; check_sent_at: string | null }) | null;
  const defaultFeatures = [pet.breed, pet.coat_color, pet.features].filter(Boolean).join("、");

  if (!report) {
    return (
      <div>
        <div className="mb-4 mt-2 px-1">
          <h1 className="text-2xl font-extrabold">{pet.name}ちゃんが迷子になったら</h1>
          <p className="mt-1 text-sm text-[#9C8273]">お知らせを出すと、次の人たちに通知が届きます。</p>
        </div>
        <PetCard className="mb-4 space-y-1.5 text-sm text-[#5C4535]">
          <p>🏘️ 最後に見た場所から<b>半径3km</b>以内を散歩エリアにしているワンコ手帳の利用者</p>
          <p>💛 {pet.name}ちゃんをフォローしている人</p>
          <p>🏷️ 首輪のQRを読んだ人には、迷子の情報と連絡先が表示されます</p>
          <p className="pt-1 text-xs text-[#9C8273]">AirTagを付けている場合は、iPhoneの「探す」アプリでも位置を確認してください。</p>
        </PetCard>
        <LostReportForm petId={pet.id} petName={pet.name} defaultFeatures={defaultFeatures} />
      </div>
    );
  }

  const { data: sightingRows } = await petAdmin()
    .from("locapass_pet_sightings")
    .select("id, lat, lng, address, comment, seen_at, photo_path")
    .eq("lost_report_id", report.id)
    .order("seen_at", { ascending: false });
  const sightings = (sightingRows ?? []) as { id: string; lat: number; lng: number; address: string | null; comment: string | null; seen_at: string; photo_path: string | null }[];
  const signed = await signPetImages([report.photo_path, ...sightings.map((s) => s.photo_path)]);
  const sinceLost = Date.parse(report.created_at) - 86_400_000;
  const nearbyFound =
    report.last_seen_lat != null && report.last_seen_lng != null
      ? (await getFoundReports({ near: { lat: report.last_seen_lat, lng: report.last_seen_lng, km: 5 }, days: 14 })).filter((f) => Date.parse(f.createdAt) >= sinceLost)
      : [];
  const markers: PetMapMarker[] = [
    ...(report.last_seen_lat != null && report.last_seen_lng != null
      ? [{ id: "last", lat: report.last_seen_lat, lng: report.last_seen_lng, kind: "last_seen" as const, label: "最後に見た場所", imageUrl: (report.photo_path ? signed.get(report.photo_path) : null) ?? pet.avatarUrl }]
      : []),
    ...sightings.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, kind: "sighting" as const, label: `${timeLabel(s.seen_at)} ${s.address ?? ""}`, imageUrl: s.photo_path ? signed.get(s.photo_path) : null })),
    ...nearbyFound.map((f) => ({ id: f.id, lat: f.lat, lng: f.lng, kind: "found" as const, label: "見つけました", imageUrl: f.photoUrl, href: `/pet/found/${f.id}` })),
  ];

  return (
    <div>
      <div className="mb-3 mt-2 rounded-[28px] bg-[#D04848] px-5 py-4 text-white shadow-[0_6px_0_#A83333]">
        <p className="text-xs font-bold opacity-80">迷子のお知らせ中</p>
        <p className="text-xl font-extrabold">{pet.name}ちゃんを探しています</p>
        <p className="mt-1 text-xs opacity-90">
          {timeLabel(report.created_at)}に開始 ・ {report.alert_sent_count}人に通知
        </p>
      </div>
      <ResolveLostButtons reportId={report.id} petName={pet.name} />

      {(() => {
        const closeAt = Date.parse(report.last_confirmed_at) + LOST_AUTO_CLOSE_DAYS * 86_400_000;
        const daysLeft = Math.max(0, Math.ceil((closeAt - Date.now()) / 86_400_000));
        return report.check_sent_at ? (
          <PetCard className="mt-3 space-y-2 border-[#FFD38A] bg-[#FFF8E1]">
            <p className="text-sm font-extrabold text-[#8A6A00]">まだ探していますか?</p>
            <p className="text-xs text-[#8A6A00]">あと{daysLeft}日で、お知らせは自動で終了し、公開している連絡先も消えます。</p>
            <ConfirmLostButton reportId={report.id} />
          </PetCard>
        ) : (
          <p className="mt-2 px-1 text-center text-[11px] text-[#B39C8C]">
            このお知らせは{LOST_AUTO_CLOSE_DAYS}日間確認がないと自動で終了します(30日目に確認の通知が届きます)
          </p>
        );
      })()}

      <PetSectionTitle emoji="📣">みんなに広める</PetSectionTitle>
      <ShareButtons
        url={`https://locapass.net/pet/lost/${report.id}`}
        text={`【迷子のワンコを探しています】${pet.name}${pet.breed ? `(${pet.breed})` : ""}${report.last_seen_address ? ` ${report.last_seen_address}付近` : ""} 見かけた方はご連絡ください。拡散お願いします #迷子犬 #ワンコ手帳`}
      />
      <p className="mt-1 px-1 text-[11px] text-[#B39C8C]">旅行先などワンコ手帳の利用者が少ない場所では、LINEやXで広めるのがいちばん効果的です。</p>

      <PetSectionTitle emoji="👀">目撃情報({sightings.length}件)</PetSectionTitle>
      <PetMap markers={markers} height={280} />
      {sightings.length === 0 ? (
        <p className="mt-2 px-1 text-sm text-[#9C8273]">まだ目撃情報はありません。届いたら通知でお知らせします。</p>
      ) : (
        <div className="mt-3 space-y-2">
          {sightings.map((s) => (
            <PetCard key={s.id} className="flex gap-3">
              {s.photo_path && signed.get(s.photo_path) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signed.get(s.photo_path)} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#FFF6D6] text-2xl">👀</span>
              )}
              <div className="min-w-0 text-sm">
                <p className="font-extrabold">{timeLabel(s.seen_at)}</p>
                {s.address && <p className="text-xs text-[#7A6050]">📍 {s.address}</p>}
                {s.comment && <p className="mt-0.5 text-[#5C4535]">{s.comment}</p>}
                <a href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#6AADEB] underline">
                  地図で開く
                </a>
              </div>
            </PetCard>
          ))}
        </div>
      )}

      {nearbyFound.length > 0 && (
        <>
          <PetSectionTitle emoji="🙋">近くの「見つけました」通報({nearbyFound.length})</PetSectionTitle>
          <p className="mb-2 px-1 text-xs text-[#9C8273]">最後に見た場所から5km以内の通報です。うちの子なら、開いて「うちの子かも!」を押してください。</p>
          <div className="space-y-2">
            {nearbyFound.map((f) => (
              <FoundReportCard key={f.id} report={f} />
            ))}
          </div>
        </>
      )}

      <PetSectionTitle emoji="✏️">お知らせの内容を直す</PetSectionTitle>
      <LostReportForm
        petId={pet.id}
        petName={pet.name}
        defaultFeatures={defaultFeatures}
        existing={{
          id: report.id,
          lastSeenAt: report.last_seen_at,
          lat: report.last_seen_lat,
          lng: report.last_seen_lng,
          address: report.last_seen_address,
          features: report.features,
          contactPhone: report.contact_phone,
          contactLine: report.contact_line,
          contactNote: report.contact_note,
        }}
      />
    </div>
  );
}
