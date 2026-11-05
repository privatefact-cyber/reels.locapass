import Link from "next/link";
import { FOUND_KIND_LABEL, SPECIES_EMOJI, SPECIES_LABEL, type PublicFoundReport } from "@/lib/pet/found";

export function foundTimeLabel(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 「見つけました」通報のカード(一覧用)。タップで詳細・共有ページへ。 */
export function FoundReportCard({ report }: { report: PublicFoundReport }) {
  return (
    <Link href={`/pet/found/${report.id}`} className="block active:scale-[0.99]">
      <div className="flex gap-3 rounded-[28px] border-2 border-[#BFE8DA] bg-white p-3 shadow-[0_6px_20px_-12px_rgba(40,120,90,0.4)]">
        {report.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={report.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-3xl object-cover" />
        ) : (
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-[#E5F7F0] text-4xl">{SPECIES_EMOJI[report.species]}</span>
        )}
        <div className="min-w-0">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-white ${report.kind === "protected" ? "bg-[#2E9C7C]" : "bg-[#E0A800]"}`}>
            {report.status === "resolved" ? "解決しました" : FOUND_KIND_LABEL[report.kind]}
          </span>
          <p className="mt-1 text-sm font-extrabold">迷子の{SPECIES_LABEL[report.species]}</p>
          <p className="text-xs text-[#7A6050]">🕒 {foundTimeLabel(report.foundAt)}</p>
          {report.address && <p className="truncate text-xs text-[#7A6050]">📍 {report.address}</p>}
          {report.features && <p className="mt-0.5 line-clamp-1 text-xs text-[#9C8273]">{report.features}</p>}
        </div>
      </div>
    </Link>
  );
}
