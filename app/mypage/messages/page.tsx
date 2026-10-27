import Link from "next/link";
import { requireCurrentUser } from "@/lib/user/current-user";
import { createClient } from "@/lib/supabase/server";

export default async function MypageMessagesPage() {
  const user = await requireCurrentUser("/mypage/messages");
  const supabase = await createClient();

  const { data: threads } = await supabase
    .from("locapass_staff_dm_threads")
    .select(
      "id, last_message_at, locapass_shop_staff_members ( name, locapass_shops ( name ) ), locapass_cast_members ( name, locapass_shops ( name ) )",
    )
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false });

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-6">
      <div>
        <h1 className="text-lg font-bold text-tone-100">メッセージ</h1>
        <p className="mt-1 text-xs text-tone-500">このアカウントでやり取りしたスタッフ・FACESのメッセージ一覧です。メッセージは相互フォローのときだけ送れます。</p>
      </div>

      {threads && threads.length > 0 ? (
        <ul className="divide-y divide-main/10 rounded-xl border border-main/10 bg-surface">
          {threads.map((t) => {
            const staffRaw = Array.isArray(t.locapass_shop_staff_members)
              ? t.locapass_shop_staff_members[0]
              : t.locapass_shop_staff_members;
            const castRaw = Array.isArray(t.locapass_cast_members) ? t.locapass_cast_members[0] : t.locapass_cast_members;
            const staff = staffRaw ?? castRaw;
            const peerLabel = staffRaw ? "スタッフ" : "FACES";
            const shop = staff ? (Array.isArray(staff.locapass_shops) ? staff.locapass_shops[0] : staff.locapass_shops) : null;
            return (
              <li key={t.id}>
                <Link href={`/mypage/messages/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-tone-100">
                      {shop?.name ?? "LOCAPASS"}({staff?.name ?? peerLabel})
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-tone-500">
                    {new Date(t.last_message_at).toLocaleString("ja-JP")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-main/10 bg-surface p-6 text-center text-sm text-tone-500">
          まだメッセージはありません。
        </p>
      )}
    </div>
  );
}
