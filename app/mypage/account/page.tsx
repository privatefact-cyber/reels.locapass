import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireCurrentUser } from "@/lib/user/current-user";
import { createClient } from "@/lib/supabase/server";
import { MypagePasswordForm } from "@/components/MypagePasswordForm";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { NotificationPreferencesForm } from "@/components/NotificationPreferencesForm";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";

export default async function MypageAccountPage() {
  await requireCurrentUser("/mypage/account");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getServerLocale();
  const t = dictionaries[locale];

  return (
    <div className="mx-auto max-w-sm px-4 py-6">
      <div className="flex items-center gap-2">
        <Link href="/mypage" aria-label={t.mypage.back} className="text-white/80">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-lg font-semibold uppercase tracking-[0.2em] text-gold">
          {t.mypage.accountSettings}
        </h1>
      </div>

      <p className="mt-4 text-xs text-neutral-400">{user?.email}</p>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-bold text-gold">{t.mypage.passwordTitle}</h2>
        <p className="mt-1 text-xs text-neutral-400">{t.mypage.passwordDesc}</p>
        <MypagePasswordForm />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-bold text-gold">{t.mypage.pushTitle}</h2>
        <p className="mt-1 text-xs text-neutral-400">{t.mypage.pushDesc}</p>
        <PushNotificationToggle />
        <NotificationPreferencesForm />
      </div>
    </div>
  );
}
