import type { SupabaseClient } from "@supabase/supabase-js";

type SchedulePayload = {
  cast_id: string;
  date: string;
  is_working_today: boolean;
  start_time: string | null;
  end_time: string | null;
};

/**
 * 出勤予定を「同じキャスト・同じ日は1件だけ」として保存する。
 * すでにその日の予定があれば上書きし、無ければ新規作成する(二重登録で同じ日が2件並ぶのを防ぐ)。
 * 戻り値は保存された行のid配列(RLSで0件になった場合に呼び出し側が検知できるよう、他の更新と同じ形にしてある)。
 */
export async function saveSchedule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  table: "schedules" | "locapass_schedules",
  payload: SchedulePayload,
): Promise<{ data: { id: string }[] | null; error: { message: string } | null }> {
  const { data: existing, error: findError } = await supabase
    .from(table)
    .select("id")
    .eq("cast_id", payload.cast_id)
    .eq("date", payload.date)
    .order("id")
    .limit(1);
  if (findError) return { data: null, error: findError };

  const existingId = existing?.[0]?.id as string | undefined;
  return existingId
    ? await supabase.from(table).update(payload).eq("id", existingId).select("id")
    : await supabase.from(table).insert(payload).select("id");
}
