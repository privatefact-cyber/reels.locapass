import { requireCurrentUser } from "@/lib/user/current-user";
import { NotificationsList } from "@/components/NotificationsList";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";

export default async function NotificationsPage() {
  await requireCurrentUser("/notifications");
  const locale = await getServerLocale();
  const t = dictionaries[locale];

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-lg font-bold text-neutral-100">{t.nav.notifications}</h1>
      <NotificationsList />
    </div>
  );
}
