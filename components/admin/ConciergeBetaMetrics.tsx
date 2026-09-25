import { createClient } from "@/lib/supabase/server";

const DAYS = 14;

const MODE_LABEL: Record<string, string> = { concierge: "コンシェルジュ", machi: "街の声 β" };

/**
 * 街の声ベータ版の手応えを、通常コンシェルジュと並べて見る表(直近DAYS日)。
 * 集計はDBの concierge_beta_metrics(運営のみ実行可、supabase/migrations 00097)。
 *   会話の長さ = 1会話あたりのユーザー発言数 / 店クリック = 返事に出た店舗ボタンの押下
 *   再訪 = 同じ会話で2日以上話しかけた会話の割合
 */
export async function ConciergeBetaMetrics() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("concierge_beta_metrics", { p_site: "locapass", p_days: DAYS });
  const rows = data ?? [];

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">直近{DAYS}日</th>
            <th className="px-3 py-2 font-medium">会話数</th>
            <th className="px-3 py-2 font-medium">会話の長さ(発言/会話)</th>
            <th className="px-3 py-2 font-medium">店クリック(1会話あたり)</th>
            <th className="px-3 py-2 font-medium">再訪(2日以上の会話)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {rows.map((r) => (
            <tr key={r.mode}>
              <td className="px-3 py-2 font-semibold">{MODE_LABEL[r.mode] ?? r.mode}</td>
              <td className="px-3 py-2">{r.conversations}</td>
              <td className="px-3 py-2">{r.avg_user_messages ?? 0}</td>
              <td className="px-3 py-2">
                {r.link_clicks}件({r.clicks_per_conversation ?? 0})
              </td>
              <td className="px-3 py-2">
                {r.returning_conversations}件({r.return_rate_pct ?? 0}%)
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                {error ? `集計を取得できませんでした: ${error.message}` : "まだ会話がありません"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
