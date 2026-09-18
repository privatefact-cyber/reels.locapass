"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getViewerId } from "@/lib/reels/viewer-id";
import { saveLocalInquiry } from "@/lib/inquiries/local-inquiries";
import { useLocale } from "@/components/i18n/LocaleProvider";

/** 一般ユーザーがログイン不要で店舗宛てに来店予約・問い合わせDMを送るボタン+モーダル。 */
export function InquiryButton({ shopId, shopName }: { shopId: string; shopName: string }) {
  const router = useRouter();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_shop_inquiry", {
      p_shop_id: shopId,
      p_viewer_id: getViewerId(),
      p_customer_name: name,
      p_contact: contact,
      p_body: body,
    });

    setSending(false);
    if (error || !data) {
      setError(t.shop.inquirySendFailed);
      return;
    }

    saveLocalInquiry({
      inquiryId: data,
      shopId,
      shopName,
      createdAt: new Date().toISOString(),
    });
    router.push(`/inquiries/${data}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300 backdrop-blur-xl transition hover:bg-amber-500/20"
      >
        <MessageCircle size={16} />
        {t.shop.inquiryButton}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl border border-amber-500/20 bg-zinc-950 p-5 sm:rounded-2xl">
            <h2 className="text-sm font-bold text-neutral-100">
              {t.shop.inquiryModalTitlePrefix}
              {shopName}
              {t.shop.inquiryModalTitleSuffix}
            </h2>
            <p className="mt-1 text-xs text-neutral-500">{t.shop.inquiryModalHint}</p>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.shop.inquiryNamePlaceholder}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
              />
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={t.shop.inquiryContactPlaceholder}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={4}
                placeholder={t.shop.inquiryBodyPlaceholder}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-full border border-white/20 px-4 py-2 text-sm text-neutral-300"
                >
                  {t.common.close}
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                >
                  {sending ? t.shop.inquirySending : t.shop.inquirySubmit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
