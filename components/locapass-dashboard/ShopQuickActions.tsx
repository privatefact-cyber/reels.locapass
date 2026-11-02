"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Clapperboard, MessageCircle, Zap } from "lucide-react";
import { STATUS_LABEL, fileToBase64 } from "@/components/locapass-dashboard/FloorStatusDropzone";

const TILE =
  "relative flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition active:scale-[0.97] active:bg-slate-50";

/**
 * 店舗管理画面の最初に出す、よく使う操作のショートカット(スマホ向け)。
 * 2列の大きなタイル=親指で押せる大きさ。空席の更新だけは、その場でカメラ/写真選択→AI判定まで行う。
 */
export function ShopQuickActions({
  shopId,
  basePath,
  initialStatusText,
  openInquiries,
}: {
  shopId: string;
  basePath: string;
  initialStatusText: string | null;
  openInquiries: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState(initialStatusText);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/admin/locapass-shop-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, imageBase64, mimeType: file.type || "image/jpeg" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "判定に失敗しました");
      const time = new Date(data.occupancyStatus.captured_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      setStatusText(`${STATUS_LABEL[data.occupancyStatus.status] ?? data.occupancyStatus.status}(${time})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "判定に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="よく使う操作">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={`${TILE} disabled:opacity-60`}>
          <Camera size={28} className="text-rose-500" />
          <span className="text-sm font-bold text-slate-900">{busy ? "AI判定中…" : "空席を更新"}</span>
          <span className="text-[11px] leading-tight text-slate-500">
            {statusText ? `現在: ${statusText}` : "フロアを撮るだけ"}
          </span>
        </button>
        <Link href={`${basePath}/reels`} className={TILE}>
          <Clapperboard size={28} className="text-indigo-500" />
          <span className="text-sm font-bold text-slate-900">リール投稿</span>
          <span className="text-[11px] leading-tight text-slate-500">動画・写真を投稿</span>
        </Link>
        <Link href={`${basePath}/boost`} className={TILE}>
          <Zap size={28} className="text-amber-500" />
          <span className="text-sm font-bold text-slate-900">ブースト</span>
          <span className="text-[11px] leading-tight text-slate-500">今すぐ宣伝する</span>
        </Link>
        <Link href={`${basePath}/inquiries`} className={TILE}>
          <MessageCircle size={28} className="text-emerald-500" />
          <span className="text-sm font-bold text-slate-900">お問い合わせ</span>
          <span className="text-[11px] leading-tight text-slate-500">
            {openInquiries > 0 ? `未対応 ${openInquiries}件` : "未対応はありません"}
          </span>
          {openInquiries > 0 && (
            <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
              {openInquiries}
            </span>
          )}
        </Link>
      </div>
      {/* captureは付けない(カメラ固定になりギャラリーが選べなくなる端末があるため)。OS標準の「撮影/ライブラリ」選択が出る。 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </section>
  );
}
