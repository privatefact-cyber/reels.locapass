"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Phone } from "lucide-react";
import { revealFoundContact, revealLostContact, type RevealedContact } from "@/app/pet/actions";

/**
 * 「連絡先を表示」ボタン。押したときだけサーバーから連絡先を取りに行く
 * (ページのHTMLに電話番号などを載せないので、検索エンジンやキャッシュに残らない)。
 */
export function ContactReveal({ type, id, label, tone = "red" }: { type: "lost" | "found"; id: string; label: string; tone?: "red" | "green" }) {
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<RevealedContact | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (contact) {
    const any = contact.phone || contact.line || contact.note || contact.handedTo;
    return (
      <div className="grid gap-2">
        {contact.phone && (
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#D04848] px-4 py-3 text-sm font-extrabold text-white shadow-[0_3px_0_#A83333]">
            <Phone size={16} />
            電話する({contact.phone})
          </a>
        )}
        {contact.line && (
          <p className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#06C755] px-4 py-3 text-sm font-extrabold text-white">
            <MessageCircle size={16} />
            LINE ID: {contact.line}
          </p>
        )}
        {contact.handedTo && <p className="rounded-2xl bg-white px-3 py-2 text-sm font-bold text-[#22806A]">🏠 {contact.handedTo}</p>}
        {contact.note && <p className="whitespace-pre-wrap rounded-2xl bg-white px-3 py-2 text-sm text-[#5C4535]">💬 {contact.note}</p>}
        {contact.features && <p className="whitespace-pre-wrap rounded-2xl bg-white px-3 py-2 text-xs text-[#7A6050]">特徴: {contact.features}</p>}
        {!any && <p className="text-center text-xs text-[#9C8273]">連絡先は登録されていません</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = type === "lost" ? await revealLostContact(id) : await revealFoundContact(id);
          setBusy(false);
          if (res.ok) setContact(res.contact);
          else setError(res.error);
        }}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-3 text-sm font-extrabold text-white ${tone === "red" ? "bg-[#D04848] shadow-[0_3px_0_#A83333]" : "bg-[#2E9C7C] shadow-[0_3px_0_#22806A]"}`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
        {label}
      </button>
      {error && <p className="mt-1 text-center text-xs font-bold text-[#D04848]">{error}</p>}
    </div>
  );
}
