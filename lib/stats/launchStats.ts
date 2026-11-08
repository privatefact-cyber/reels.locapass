import { createAdminClient } from "@/lib/supabase/admin";

export type LaunchStats = { shops: number; reels: number };

/**
 * トップのモーダルに出す、現在の登録件数(公開中の店舗と、公開中のリール)。
 * 数えるだけで中身は読まない。失敗したらnullを返し、モーダルは件数なしで出る(トップ全体は止めない)。
 */
export async function getLaunchStats(): Promise<LaunchStats | null> {
  try {
    const admin = createAdminClient() as any;
    const [shops, reels] = await Promise.all([
      admin.from("locapass_shops").select("id", { count: "exact", head: true }).eq("status", "active"),
      admin.from("locapass_reels").select("id", { count: "exact", head: true }).eq("status", "publish").eq("reel_type", "permanent"),
    ]);
    if (shops.error || reels.error || shops.count == null || reels.count == null) return null;
    return { shops: shops.count as number, reels: reels.count as number };
  } catch {
    return null;
  }
}
