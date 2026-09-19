"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Calendar, Film, MessageSquare, Megaphone, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/LocaleProvider";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

const ICONS: Record<string, typeof Bell> = {
  new_cast: UserPlus,
  new_event: Calendar,
  new_shop_reel: Film,
  new_cast_reel: Film,
  shop_message: MessageSquare,
  admin_message: Megaphone,
};

export function NotificationsList() {
  const { t } = useLocale();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid || cancelled) return;

      const { data: rows } = await supabase
        .from("locapass_notifications")
        .select("id, type, title, body, url, read_at, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);

      if (cancelled) return;
      setNotifications(rows ?? []);

      // 開いたら未読を既読にする(Instagramの通知欄と同じ挙動)。
      await supabase.from("locapass_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).is("read_at", null);
      // ヘッダーのベルバッジは初回マウント時に件数を取得したきり更新されないため、
      // 既読化したことをイベントで知らせて即座に消す。
      window.dispatchEvent(new Event("luxela:notifications-read"));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (notifications === null) return null;

  if (notifications.length === 0) {
    return <p className="mt-10 text-center text-sm text-neutral-500">{t.notifications.empty}</p>;
  }

  return (
    <ul className="mt-4 space-y-1">
      {notifications.map((n) => {
        const Icon = ICONS[n.type] ?? Bell;
        const content = (
          <div
            className={`flex items-start gap-3 rounded-xl px-3 py-3 transition ${
              n.read_at ? "bg-transparent" : "bg-white/5"
            }`}
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-gold">
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-100">{n.title}</p>
              {n.body && <p className="mt-0.5 truncate text-xs text-neutral-400">{n.body}</p>}
              <p className="mt-1 text-[11px] text-neutral-500">
                {new Date(n.created_at).toLocaleString("ja-JP")}
              </p>
            </div>
          </div>
        );

        return (
          <li key={n.id}>
            {n.url ? (
              <Link href={n.url} className="block">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
