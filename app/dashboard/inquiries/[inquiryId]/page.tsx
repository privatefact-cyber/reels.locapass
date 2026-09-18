import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";
import { replyToInquiry } from "../actions";

export default async function DashboardInquiryThreadPage({
  params,
}: {
  params: Promise<{ inquiryId: string }>;
}) {
  const { inquiryId } = await params;
  const shop = await requireCurrentShop();
  if (!shop) {
    return (
      <p className="text-sm text-red-600">
        所属店舗が見つかりません。運営者にお問い合わせください。
      </p>
    );
  }

  const supabase = await createClient();
  const { data: inquiry } = await supabase
    .from("shop_inquiries")
    .select("id, customer_name, contact, status, created_at")
    .eq("id", inquiryId)
    .eq("shop_id", shop.id)
    .single();

  if (!inquiry) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("shop_inquiry_messages")
    .select("id, sender_type, body, created_at")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: true });

  const boundReply = replyToInquiry.bind(null, inquiryId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{inquiry.customer_name || "名前未入力"}</h1>
        <p className="text-xs text-slate-500">
          {inquiry.contact || "連絡先未入力"} ・ {new Date(inquiry.created_at).toLocaleString("ja-JP")}
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
              m.sender_type === "shop"
                ? "ml-auto bg-slate-700 text-white"
                : "mr-auto bg-slate-50 text-slate-900"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-[10px] opacity-60">
              {new Date(m.created_at).toLocaleString("ja-JP")}
            </p>
          </div>
        ))}
      </div>

      <form action={boundReply} className="flex gap-2">
        <textarea
          name="body"
          required
          rows={2}
          placeholder="返信を入力"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          返信する
        </button>
      </form>
    </div>
  );
}
