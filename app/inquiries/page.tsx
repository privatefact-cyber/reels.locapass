"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { listLocalInquiries, type LocalInquiry } from "@/lib/inquiries/local-inquiries";

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<LocalInquiry[]>([]);

  useEffect(() => {
    setInquiries(listLocalInquiries());
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-lg font-bold text-neutral-100">問い合わせ履歴</h1>
      <p className="mt-1 text-xs text-neutral-500">
        このブラウザから送った店舗への問い合わせ一覧です。
      </p>

      {inquiries.length === 0 ? (
        <p className="mt-10 text-center text-sm text-neutral-500">
          まだ問い合わせはありません。店舗ページから「来店予約・問い合わせ」を送ってみましょう。
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {inquiries.map((inq) => (
            <li key={inq.inquiryId}>
              <Link
                href={`/inquiries/${inq.inquiryId}`}
                className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-zinc-900/60 p-4 backdrop-blur-xl"
              >
                <MessageCircle size={18} className="shrink-0 text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-100">{inq.shopName}</p>
                  <p className="text-xs text-neutral-500">
                    {new Date(inq.createdAt).toLocaleString("ja-JP")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
