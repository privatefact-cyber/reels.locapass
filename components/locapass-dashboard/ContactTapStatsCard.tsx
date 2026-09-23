/** 店舗ダッシュボードに出す「LOCAPASS経由の連絡タップ数」。押した人は特定しない匿名の回数集計。 */
export type ContactTapStat = { kind: string; taps_7d: number; taps_30d: number };

const ROWS: { kind: string; label: string }[] = [
  { kind: "line", label: "LINEで問い合わせ" },
  { kind: "phone", label: "電話で問い合わせ" },
  { kind: "line_qr", label: "LINEのQRコードを表示" },
];

export function ContactTapStatsCard({ stats }: { stats: ContactTapStat[] }) {
  const byKind = new Map(stats.map((s) => [s.kind, s]));
  const total7 = stats.reduce((sum, s) => sum + Number(s.taps_7d), 0);
  const total30 = stats.reduce((sum, s) => sum + Number(s.taps_30d), 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">LOCAPASS経由の連絡</h2>
          <p className="mt-1 text-xs text-slate-500">
            店舗ページの連絡ボタンが押された回数です。実際に通話・友だち追加まで進んだ数ではありません。
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-slate-900">
            {total7}
            <span className="text-base font-semibold text-slate-500"> 回</span>
          </p>
          <p className="text-xs text-slate-500">直近7日(30日: {total30}回)</p>
        </div>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
            <th className="py-2 font-medium">種類</th>
            <th className="py-2 text-right font-medium">7日</th>
            <th className="py-2 text-right font-medium">30日</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const s = byKind.get(row.kind);
            return (
              <tr key={row.kind} className="border-b border-slate-50 last:border-0">
                <td className="py-2 text-slate-700">{row.label}</td>
                <td className="py-2 text-right font-semibold text-slate-900">{s ? Number(s.taps_7d) : 0}</td>
                <td className="py-2 text-right text-slate-600">{s ? Number(s.taps_30d) : 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 text-xs text-slate-500">
        電話はLOCAPASS経由かどうかを自動では判別できないため、お客さんに「LOCAPASSを見た」と伝えてもらう案内を連絡画面に表示しています。
      </p>
    </section>
  );
}
