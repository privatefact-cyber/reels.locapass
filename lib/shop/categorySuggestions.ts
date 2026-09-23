import { createClient } from "@/lib/supabase/server";

/**
 * 店舗の「業種」入力欄の候補。locapass_shops.category は自由入力で、そのままフィードのタグになるため、
 * 既存の業種を使用店舗数が多い順に並べて返し、表記ゆれ(カフェ/カフェ・スイーツ 等)でタグが増えるのを抑える。
 */
export async function getCategorySuggestions(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("locapass_shops").select("category").not("category", "is", null);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const c = (row.category ?? "").trim();
    // 運営事務局の公式店舗の業種は一般の店舗が選ぶものではないので候補に出さない
    if (!c || c === "公式") continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([c]) => c);
}
