/**
 * 体重グラフ(SVGだけで描く。ライブラリなし)。点が2つ以上あるときだけ線を引く。
 */
export function WeightChart({ points }: { points: { date: string; kg: number }[] }) {
  if (points.length === 0) {
    return <p className="py-6 text-center text-sm text-[#B39C8C]">日誌に体重を入れると、ここにグラフが出ます</p>;
  }
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date)).slice(-24);
  const W = 320;
  const H = 150;
  const pad = { l: 34, r: 12, t: 14, b: 26 };
  const min = Math.min(...sorted.map((p) => p.kg));
  const max = Math.max(...sorted.map((p) => p.kg));
  const span = Math.max(0.5, max - min);
  const lo = Math.max(0, min - span * 0.2);
  const hi = max + span * 0.2;
  const x = (i: number) => pad.l + (sorted.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (sorted.length - 1));
  const y = (kg: number) => pad.t + (1 - (kg - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = sorted.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const area = `${line} L${x(sorted.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const last = sorted[sorted.length - 1];
  const first = sorted[0];
  const diff = last.kg - first.kg;
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <p className="text-sm font-bold text-[#9C8273]">
          いま <span className="text-2xl font-extrabold text-[#4A3426]">{last.kg}</span> kg
        </p>
        {sorted.length > 1 && (
          <p className={`text-xs font-extrabold ${diff > 0 ? "text-[#EE6A36]" : diff < 0 ? "text-[#4FBF9F]" : "text-[#9C8273]"}`}>
            {md(first.date)}から {diff > 0 ? "+" : ""}
            {diff.toFixed(2).replace(/\.?0+$/, "")}kg
          </p>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`体重の推移。最新は${last.kg}kg`}>
        <defs>
          <linearGradient id="petWeightFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#FF8E5E" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#FF8E5E" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#F6EBDF" strokeDasharray="3 4" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#B39C8C">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        {sorted.length > 1 && <path d={area} fill="url(#petWeightFill)" />}
        {sorted.length > 1 && <path d={line} fill="none" stroke="#FF8E5E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {sorted.map((p, i) => (
          <circle key={`${p.date}-${i}`} cx={x(i)} cy={y(p.kg)} r={i === sorted.length - 1 ? 5 : 3} fill="#fff" stroke="#FF8E5E" strokeWidth="2.5" />
        ))}
        <text x={x(0)} y={H - 8} fontSize="9" fill="#B39C8C" textAnchor="start">
          {md(first.date)}
        </text>
        {sorted.length > 1 && (
          <text x={x(sorted.length - 1)} y={H - 8} fontSize="9" fill="#B39C8C" textAnchor="end">
            {md(last.date)}
          </text>
        )}
      </svg>
    </div>
  );
}
