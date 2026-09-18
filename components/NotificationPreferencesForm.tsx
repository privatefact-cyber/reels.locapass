"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ToggleSwitch } from "@/components/ToggleSwitch";

type PreferenceKey = "new_cast" | "new_event" | "new_shop_reel" | "new_cast_reel" | "shop_message";

const ITEMS: { key: PreferenceKey; label: string; description: string }[] = [
  { key: "new_cast", label: "新規キャスト", description: "お気に入り店舗に新しいキャストが入ったとき" },
  { key: "new_event", label: "新規イベント", description: "お気に入り店舗の新着イベント" },
  { key: "new_shop_reel", label: "店舗の新着リール", description: "お気に入り店舗が新しいリールを投稿したとき" },
  { key: "new_cast_reel", label: "キャストの新着リール", description: "フォロー中キャストが新しいリールを投稿したとき" },
  { key: "shop_message", label: "店舗からのメッセージ", description: "お気に入り店舗からのお知らせ・DM" },
];

type Preferences = Record<PreferenceKey, boolean>;

const DEFAULT_PREFERENCES: Preferences = {
  new_cast: true,
  new_event: true,
  new_shop_reel: true,
  new_cast_reel: true,
  shop_message: true,
};

export function NotificationPreferencesForm() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      setUserId(uid);

      const { data: row } = await supabase
        .from("notification_preferences")
        .select("new_cast, new_event, new_shop_reel, new_cast_reel, shop_message")
        .eq("user_id", uid)
        .maybeSingle();

      if (cancelled) return;
      setPrefs(row ? { ...DEFAULT_PREFERENCES, ...row } : DEFAULT_PREFERENCES);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: PreferenceKey, next: boolean) {
    if (!userId || !prefs) return;
    setPrefs({ ...prefs, [key]: next });

    const partial: Partial<Preferences> = { [key]: next };
    const supabase = createClient();
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        { user_id: userId, updated_at: new Date().toISOString(), ...partial },
        { onConflict: "user_id" },
      );

    if (error) {
      // 保存に失敗したら見た目も元に戻す。
      setPrefs((prev) => (prev ? { ...prev, [key]: !next } : prev));
    }
  }

  if (!prefs) return null;

  return (
    <ul className="mt-3 divide-y divide-white/10">
      {ITEMS.map((item) => (
        <li key={item.key} className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-semibold text-neutral-200">{item.label}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{item.description}</p>
          </div>
          <ToggleSwitch
            checked={prefs[item.key]}
            onChange={(next) => toggle(item.key, next)}
            label={item.label}
          />
        </li>
      ))}
    </ul>
  );
}
