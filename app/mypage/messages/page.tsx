import Link from "next/link";
import { requireCurrentUser } from "@/lib/user/current-user";
import { createClient } from "@/lib/supabase/server";
import { FollowersPanel } from "@/components/locapass-mypage/FollowersPanel";

export default async function MypageMessagesPage() {
  await requireCurrentUser("/mypage/messages");
  const supabase = await createClient();

  const { data: threads } = await supabase.rpc("locapass_my_dm_threads");

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-6">
      <div>
        <h1 className="text-lg font-bold text-tone-100">メッセージ</h1>
        <p className="mt-1 text-xs leading-relaxed text-tone-500">
          友達・スタッフ・FACESと、1対1でやり取りできます。画像も送れます。
        </p>
      </div>

      {/* 使い方: お互いにフォローするとメッセージが開く */}
      <div className="rounded-xl border border-main/10 bg-surface p-4 text-xs leading-relaxed text-tone-300">
        <p className="font-semibold text-tone-100">メッセージを送るには</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>送りたい相手のプロフィールを開いて、フォローします</li>
          <li>相手もあなたをフォローすると、お互いにメッセージが送れるようになります</li>
          <li>下の「フォロワー」から、フォローを返してそのままメッセージも送れます</li>
        </ol>
        <p className="mt-2 text-tone-500">どちらかがフォローを外すか、ブロックすると、メッセージは送れなくなります。</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-bold text-tone-100">メッセージ一覧</h2>
        {threads && threads.length > 0 ? (
          <ul className="divide-y divide-main/10 rounded-xl border border-main/10 bg-surface">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/mypage/messages/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-tone-100">{t.label}</p>
                  <span className="shrink-0 text-xs text-tone-500">{new Date(t.last_message_at).toLocaleString("ja-JP")}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-main/10 bg-surface p-6 text-center text-sm text-tone-500">
            まだメッセージはありません。
          </p>
        )}
      </section>

      <FollowersPanel flush />
    </div>
  );
}
