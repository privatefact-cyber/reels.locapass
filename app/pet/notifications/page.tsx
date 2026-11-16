import Link from "next/link";
import { petAdmin, requirePetViewer } from "@/lib/pet/db";
import { PetCard } from "@/components/pet/ui";

export const dynamic = "force-dynamic";

/** ロカわんのお知らせ(ロカわんの通知の種類だけ)。LOCAPASS全体の通知は、LOCAPASS側の画面で見る */
const TYPES = ["pet_reminder", "pet_lost_alert", "pet_follow_request", "pet_follow_approved", "pet_sighting", "pet_found", "pet_found_claim", "pet_lost_check"];
const ICON: Record<string, string> = {
  pet_reminder: "💉",
  pet_lost_alert: "🚨",
  pet_follow_request: "💗",
  pet_follow_approved: "💗",
  pet_sighting: "👀",
  pet_found: "🙋",
  pet_found_claim: "🐶",
  pet_lost_check: "🔔",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function PetNotificationsPage() {
  const { supabase, userId } = await requirePetViewer("/pet/notifications");
  const { data } = await supabase
    .from("locapass_notifications")
    .select("id, type, title, body, url, read_at, created_at")
    .eq("user_id", userId)
    .in("type", TYPES)
    .order("created_at", { ascending: false })
    .limit(100);
  const items = data ?? [];

  // 開いたら、ロカわんのお知らせは、すべて既読にする(この画面では、開く前の「新着」の印を残して表示する)
  if (items.some((n) => !n.read_at)) {
    await petAdmin().from("locapass_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null).in("type", TYPES);
  }

  return (
    <div>
      <div className="mb-3 mt-2 px-1">
        <h1 className="text-2xl font-extrabold">お知らせ</h1>
        <p className="mt-1 text-xs text-[#9C8273]">ワクチンの期限・迷子・フォローなど、ロカわんのお知らせです。</p>
      </div>
      {items.length === 0 ? (
        <PetCard className="py-10 text-center text-sm text-[#9C8273]">
          <div className="text-4xl" aria-hidden>
            🐾
          </div>
          <p className="mt-2 font-bold">お知らせは、まだありません</p>
        </PetCard>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const inner = (
              <PetCard className="flex items-start gap-3 !p-3">
                <span className="mt-0.5 text-2xl" aria-hidden>
                  {ICON[n.type as string] ?? "🐾"}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex items-center gap-2">
                    <b className="block flex-1 leading-snug">{n.title}</b>
                    {!n.read_at && <span className="shrink-0 rounded-full bg-[#FF8E5E] px-2 py-0.5 text-[10px] font-extrabold text-white">新着</span>}
                  </span>
                  {n.body && <span className="mt-0.5 block text-xs leading-relaxed text-[#7A6050]">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-[#B39C8C]">{when(n.created_at as string)}</span>
                </span>
              </PetCard>
            );
            const href = typeof n.url === "string" && n.url.startsWith("/") && !n.url.startsWith("//") ? n.url : null;
            return <li key={n.id as string}>{href ? <Link href={href}>{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
      <p className="mt-6 text-center text-xs text-[#B39C8C]">
        <Link href="/notifications" className="font-bold text-[#EE6A36] underline">
          LOCAPASS全体のお知らせを見る
        </Link>
      </p>
    </div>
  );
}
