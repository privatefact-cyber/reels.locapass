// 掲載料・契約・代理店の新しいテーブルは、生成済みの型(types/supabase.ts)にまだ無い。
// 型定義が巨大で自動編集できないため、ここだけ型を外して扱う(supabase自体をanyにcastする。.fromだけ切り離すとthisが外れる)。
export function billingDb(supabase: unknown) {
  return supabase as any;
}

export const yen = (n: number | null | undefined) => `¥${(n ?? 0).toLocaleString("ja-JP")}`;

/** "YYYY-MM" → その月の1日(YYYY-MM-01)。不正なら今月(日本時間)。 */
export function monthParam(raw: string | undefined): string {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return `${raw}-01`;
  const jst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  return `${jst}-01`;
}
