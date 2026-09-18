import { createStaticClient } from "@/lib/supabase/static";

/**
 * サイト全体の設定(1行だけのシングルトンテーブル)。まずはトップのFEATURED枠(提携店舗特集)の
 * 表示可否だけを持つ。公開情報なのでcookie非依存のクライアントで読む(マップAPI等と同じ考え方)。
 */
export async function isFeaturedSectionEnabled(): Promise<boolean> {
  const supabase = createStaticClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("featured_section_enabled")
    .eq("id", true)
    .maybeSingle();
  // 行が無い場合は安全側(非表示)に倒す。
  return data?.featured_section_enabled ?? false;
}
