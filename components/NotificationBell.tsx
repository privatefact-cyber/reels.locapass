"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/LocaleProvider";

export function NotificationBell({ size = 20 }: { size?: number }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const { t } = useLocale();

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const fetchCount = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const { count } = await supabase
        .from("locapass_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .is("read_at", null);
      if (!cancelled) setUnreadCount(count ?? 0);
    };

    fetchCount();

    // 通知一覧ページで既読にした直後、このベルは再マウントされない(共通ヘッダーのため)
    // ので、イベントを受けて件数を取り直す(既読化=0件になるはず)。
    const onRead = () => fetchCount();
    window.addEventListener("luxela:notifications-read", onRead);
    return () => {
      cancelled = true;
      window.removeEventListener("luxela:notifications-read", onRead);
    };
  }, []);

  return (
    <Link href="/notifications" aria-label={t.nav.notifications} className="relative text-white/90">
      <Bell size={size} />
      {unreadCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
