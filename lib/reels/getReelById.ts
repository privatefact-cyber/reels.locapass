import { createClient } from "@/lib/supabase/server";
import { REEL_SELECT, toReelItem, type ReelRow } from "@/lib/reels/getPortalFeedData";
import type { Locale } from "@/lib/i18n/locale";
import type { ReelItem } from "@/lib/reels/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 公開中のリール1本(共有ページ用)。無い・期限切れ・IDが不正ならnull。 */
export async function getReelById(id: string, locale: Locale = "ja"): Promise<ReelItem | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("locapass_reels")
    .select(REEL_SELECT)
    .eq("id", id)
    .eq("status", "publish")
    .or("expires_at.is.null,expires_at.gt.now()")
    .maybeSingle();
  return data ? toReelItem(data as unknown as ReelRow, locale) : null;
}
