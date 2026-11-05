import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import type { PublicLostReport } from "@/lib/pet/lost";

function timeLabel(iso: string | null) {
  if (!iso) return "ー";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 迷子情報のカード(迷子マップ・名刺ページ共通)。連絡先は飼い主が公開を選んだものだけ。 */
export function LostInfoCard({ report, showSightingLink = true }: { report: PublicLostReport; showSightingLink?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[28px] border-2 border-[#F5B5B5] bg-white shadow-[0_6px_20px_-12px_rgba(160,40,40,0.4)]">
      <div className="flex gap-3 p-4">
        {report.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={report.photoUrl} alt={report.petName} className="h-24 w-24 shrink-0 rounded-3xl object-cover" />
        ) : (
          <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-[#FFE3CF] text-4xl">🐶</span>
        )}
        <div className="min-w-0">
          <span className="inline-block rounded-full bg-[#D04848] px-2.5 py-0.5 text-[11px] font-extrabold text-white">迷子です</span>
          <p className="mt-1 text-lg font-extrabold">{report.petName}</p>
          {report.breed && <p className="text-xs font-bold text-[#9C8273]">{report.breed}</p>}
          <p className="mt-1 text-xs text-[#7A6050]">🕒 {timeLabel(report.lastSeenAt)} ごろ</p>
          {report.address && <p className="text-xs text-[#7A6050]">📍 {report.address}</p>}
        </div>
      </div>
      {report.features && <p className="mx-4 mb-3 whitespace-pre-wrap rounded-2xl bg-[#FFF6F0] px-3 py-2 text-sm text-[#5C4535]">{report.features}</p>}
      {report.contactNote && <p className="mx-4 mb-3 text-sm text-[#5C4535]">💬 {report.contactNote}</p>}
      <div className="grid gap-2 border-t border-[#FBE3E3] bg-[#FFF8F8] p-3">
        {report.contactPhone && (
          <a href={`tel:${report.contactPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#D04848] px-4 py-3 text-sm font-extrabold text-white shadow-[0_3px_0_#A83333]">
            <Phone size={16} />
            飼い主に電話する({report.contactPhone})
          </a>
        )}
        {report.contactLine && (
          <p className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#06C755] px-4 py-3 text-sm font-extrabold text-white">
            <MessageCircle size={16} />
            LINE ID: {report.contactLine}
          </p>
        )}
        {showSightingLink && !report.isOwner && (
          <Link href={`/pet/lost?report=${report.id}#sighting`} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#FFF6D6] px-4 py-3 text-sm font-extrabold text-[#9A6B00]">
            👀 ここで見た!を送る
          </Link>
        )}
      </div>
    </div>
  );
}
