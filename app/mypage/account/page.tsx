import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireCurrentUser } from "@/lib/user/current-user";
import { createClient } from "@/lib/supabase/server";
import { MypagePasswordForm } from "@/components/MypagePasswordForm";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { NotificationPreferencesForm } from "@/components/NotificationPreferencesForm";

export default async function MypageAccountPage() {
  await requireCurrentUser("/mypage/account");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-sm px-4 py-6">
      <div className="flex items-center gap-2">
        <Link href="/mypage" aria-label="戻る" className="text-white/80">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-lg font-semibold uppercase tracking-[0.2em] text-gold">
          アカウント設定
        </h1>
      </div>

      <p className="mt-4 text-xs text-neutral-400">{user?.email}</p>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-bold text-gold">パスワード</h2>
        <p className="mt-1 text-xs text-neutral-400">
          パスワードを設定しておくと、メールが使えないときでもメールアドレスとパスワードでログインできます。
        </p>
        <MypagePasswordForm />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-bold text-gold">プッシュ通知</h2>
        <p className="mt-1 text-xs text-neutral-400">
          フォロー中キャストの出勤や新着投稿などをこの端末に通知します(準備中の機能も含みます)。
        </p>
        <PushNotificationToggle />
        <NotificationPreferencesForm />
      </div>
    </div>
  );
}
