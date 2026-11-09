import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANALYTICS_SITE, ANALYTICS_SITE_LABEL } from "@/lib/analytics/site";
import { PREFECTURES, PREF_TILES } from "@/lib/analytics/prefectures";

type Summary = {
  pv: number;
  uv: number;
  prefs: { pref_code: string; pv: number; uv: number }[];
  overseas: { country: string; uv: number }[];
  unknown: number;
  daily: { day: string; pv: number; uv: number }[];
  pages: { path: string; pv: number }[];
  refs: { host: string; pv: number }[];
  devices: { device: string; pv: number }[];
};

type Flow = {
  sessions: number;
  refs: { host: string; sessions: number; pv: number; avg_pv: number; bounce_pct: number }[];
  landings: { path: string; sessions: number; avg_pv: number }[];
  next_pages: { path: string; pv: number }[];
  pv_dist: { ord: number; label: string; sessions: number }[];
};
const DIRECT = "__direct__";
const DIRECT_LABEL = "(直接・ブックマーク等)";

const DEVICE_LABEL: Record<string, string> = { mobile: "スマホ", tablet: "タブレット", desktop: "PC" };
const RANGES = [
  { days: 7, label: "直近7日" },
  { days: 30, label: "直近30日" },
  { days: 90, label: "直近90日" },
  { days: 365, label: "直近1年" },
];

function jstDate(offsetDays: number) {
  return new Date(Date.now() + 9 * 3600 * 1000 - offsetDays * 86400000).toISOString().slice(0, 10);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; pref?: string; ref?: string }>;
}) {
  const sp = await searchParams;
  const days = RANGES.some((r) => r.days === Number(sp.days)) ? Number(sp.days) : 30;
  const sel = sp.pref && PREFECTURES[sp.pref] ? sp.pref : null;
  const since = jstDate(days - 1);

  const supabase = createAdminClient();
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string, args: object) => Promise<{ data: Summary | null; error: { message: string } | null }>;
  }).rpc("site_hits_summary", { p_site: ANALYTICS_SITE, p_since: since, p_pref: sel });
  // 外部流入別の動き(流入元ごとの着地ページ・その後に見たページ)。ref 未指定=外部流入すべて。都道府県の絞り込みとは別。
  const refSel = typeof sp.ref === "string" && sp.ref.length > 0 && sp.ref.length <= 100 ? sp.ref : null;
  const { data: flowData, error: flowError } = await (supabase as unknown as {
    rpc: (fn: string, args: object) => Promise<{ data: Flow | null; error: { message: string } | null }>;
  }).rpc("site_hits_referrer_flow", { p_site: ANALYTICS_SITE, p_since: since, p_ref: refSel });
  const flow: Flow = flowData ?? { sessions: 0, refs: [], landings: [], next_pages: [], pv_dist: [] };
  const flowSelected = refSel ? flow.refs.find((r) => r.host === refSel) : null;
  const externalRefs = flow.refs.filter((r) => r.host !== DIRECT);
  const externalSessions = externalRefs.reduce((sum, r) => sum + Number(r.sessions), 0);
  const externalPv = externalRefs.reduce((sum, r) => sum + Number(r.pv), 0);
  const s: Summary = data ?? { pv: 0, uv: 0, prefs: [], overseas: [], unknown: 0, daily: [], pages: [], refs: [], devices: [] };

  const byPref = new Map(s.prefs.map((p) => [p.pref_code, p]));
  const maxUv = Math.max(1, ...s.prefs.map((p) => p.uv));
  const dailyMap = new Map(s.daily.map((d) => [d.day, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = jstDate(days - 1 - i);
    return { day: d, pv: dailyMap.get(d)?.pv ?? 0, uv: dailyMap.get(d)?.uv ?? 0 };
  });
  const maxPv = Math.max(1, ...series.map((d) => d.pv));
  const W = 760;
  const H = 160;
  const line = (key: "pv" | "uv") =>
    series
      .map((d, i) => `${((series.length > 1 ? i / (series.length - 1) : 0.5) * W).toFixed(1)},${(H - (d[key] / maxPv) * (H - 10) - 2).toFixed(1)}`)
      .join(" ");
  const href = (p: { days?: number; pref?: string | null; ref?: string | null }) => {
    const q = new URLSearchParams({ days: String(p.days ?? days) });
    const pref = p.pref === undefined ? sel : p.pref;
    if (pref) q.set("pref", pref);
    const ref = p.ref === undefined ? refSel : p.ref;
    if (ref) q.set("ref", ref);
    return `/admin/analytics?${q.toString()}`;
  };
  const refLabel = (host: string) => (host === DIRECT ? DIRECT_LABEL : host);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-bold">アクセス解析 <span className="text-xs font-normal text-slate-400">{ANALYTICS_SITE_LABEL}</span></h1>
        {RANGES.map((r) => (
          <Link key={r.days} href={href({ days: r.days })} className={`rounded-full border px-3 py-1 text-sm ${r.days === days ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
            {r.label}
          </Link>
        ))}
        {sel && (
          <Link href={href({ pref: null })} className="rounded-full border border-rose-300 bg-white px-3 py-1 text-sm text-rose-700">
            絞り込み解除: {PREFECTURES[sel]} ✕
          </Link>
        )}
      </div>
      {error && <p className="rounded bg-rose-50 p-3 text-sm text-rose-700">集計の取得に失敗しました: {error.message}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [s.pv.toLocaleString(), "ページビュー"],
          [s.uv.toLocaleString(), "訪問者数(日別・延べ。同じ人が別の日に来ると、その日数分)"],
          [`${s.prefs.length} / 47`, "アクセスのあった都道府県"],
          [s.prefs[0] ? PREFECTURES[s.prefs[0].pref_code] : "—", "最多の都道府県"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-2xl font-bold text-emerald-800">{v}</div>
            <div className="text-xs text-slate-500">{l}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold">日別推移 <span className="font-normal text-slate-400">— 濃線: ページビュー / 淡線: 訪問者</span></h2>
        <svg viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" className="h-auto w-full">
          <polyline fill="none" stroke="#065f46" strokeWidth="2" points={line("pv")} />
          <polyline fill="none" stroke="#6ee7b7" strokeWidth="2" points={line("uv")} />
          <text x="0" y={H + 14} fontSize="11" fill="#64748b">{series[0].day}</text>
          <text x={W} y={H + 14} fontSize="11" textAnchor="end" fill="#64748b">{series[series.length - 1].day}(最大 {maxPv})</text>
        </svg>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold">都道府県マップ <span className="font-normal text-slate-400">— 濃いほど訪問者が多い。クリックで絞り込み</span></h2>
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(12, 1fr)" }}>
            {Object.entries(PREF_TILES).map(([code, [c, r]]) => {
              const row = byPref.get(code);
              const alpha = row ? 0.18 + 0.82 * (row.uv / maxUv) : 0;
              const short = code === "01" ? "北海道" : PREFECTURES[code].replace(/[都道府県]$/, "");
              const style = { gridColumn: c + 1, gridRow: r + 1, background: row ? `rgba(6,95,70,${alpha.toFixed(2)})` : "#f1f5f9", color: alpha > 0.55 ? "#fff" : "#0f172a" };
              const cls = `flex aspect-square flex-col items-center justify-center overflow-hidden rounded text-center text-[10px] leading-tight ${code === sel ? "outline outline-2 outline-rose-500" : ""}`;
              const inner = (<>{short}{row && <em className="text-[11px] font-semibold not-italic">{row.uv}</em>}</>);
              return row ? (
                <Link key={code} href={href({ pref: code })} style={style} className={cls} title={`${PREFECTURES[code]} 訪問者${row.uv} / PV${row.pv}`}>{inner}</Link>
              ) : (
                <span key={code} style={style} className={cls} title={PREFECTURES[code]}>{inner}</span>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold">都道府県ランキング</h2>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                {s.prefs.map((p, i) => (
                  <tr key={p.pref_code} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                    <td className="pr-2"><Link className="text-emerald-800 hover:underline" href={href({ pref: p.pref_code })}>{PREFECTURES[p.pref_code]}</Link></td>
                    <td className="w-1/3"><span className="block h-2 rounded bg-emerald-100"><i className="block h-2 rounded bg-emerald-700" style={{ width: `${Math.max(2, (p.uv / maxUv) * 100)}%` }} /></span></td>
                    <td className="pl-2 text-right tabular-nums">{p.uv}</td>
                    <td className="pl-2 text-right tabular-nums text-slate-400">{p.pv}</td>
                  </tr>
                ))}
                {s.prefs.length === 0 && <tr><td className="py-3 text-slate-400">まだデータがありません。サイトにアクセスがあると表示されます。</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            列: 訪問者 / PV。国内で判定不能・国不明: {s.unknown}人
            {s.overseas.length > 0 && ` / 海外: ${s.overseas.map((o) => `${o.country} ${o.uv}`).join("、")}`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "人気ページ", rows: s.pages.map((p) => [p.path, p.pv] as const) },
          { title: "流入元", rows: s.refs.map((p) => [p.host, p.pv] as const) },
          { title: "端末", rows: s.devices.map((p) => [DEVICE_LABEL[p.device] ?? p.device, p.pv] as const) },
        ].map((box) => (
          <div key={box.title} className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-bold">{box.title}{sel ? `(${PREFECTURES[sel]})` : ""}</h2>
            <table className="w-full text-sm"><tbody>
              {box.rows.map(([k, v]) => (<tr key={k} className="border-b border-slate-100"><td className="break-all py-1.5 pr-2">{k}</td><td className="text-right tabular-nums">{v}</td></tr>))}
              {box.rows.length === 0 && <tr><td className="py-2 text-slate-400">データなし</td></tr>}
            </tbody></table>
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold">外部流入別の動き <span className="font-normal text-slate-400">— どこから来て、どのページに着地し、何ページ見たか(都道府県の絞り込みとは別)</span></h2>
        {flowError && <p className="rounded bg-rose-50 p-3 text-sm text-rose-700">集計の取得に失敗しました: {flowError.message}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={href({ ref: null })} className={`rounded-full border px-3 py-1 ${!refSel ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>外部流入すべて</Link>
          {flow.refs.map((r) => (
            <Link key={r.host} href={href({ ref: r.host })} className={`rounded-full border px-3 py-1 ${refSel === r.host ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              {refLabel(r.host)} <span className="opacity-60">{r.sessions}</span>
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(() => {
            const sessions = flowSelected ? Number(flowSelected.sessions) : externalSessions;
            const pv = flowSelected ? Number(flowSelected.pv) : externalPv;
            const bounce = flowSelected ? Number(flowSelected.bounce_pct) : externalSessions ? Math.round((flow.pv_dist.find((d) => d.ord === 1)?.sessions ?? 0) / externalSessions * 100) : 0;
            return [
              [sessions.toLocaleString(), "訪問数(同じ日・同じ訪問者を1訪問)"],
              [sessions ? (pv / sessions).toFixed(1) : "—", "1訪問あたりのページ数"],
              [sessions ? `${bounce}%` : "—", "1ページだけで帰った割合"],
              [`${flow.sessions.toLocaleString()}`, "全体の訪問数(直接を含む)"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-xl font-bold text-emerald-800">{v}</div>
                <div className="text-xs text-slate-500">{l}</div>
              </div>
            ));
          })()}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-bold">着地ページ <span className="font-normal text-slate-400">最初に開いたページ</span></h3>
            <table className="w-full text-sm"><tbody>
              {flow.landings.map((l) => (<tr key={l.path} className="border-b border-slate-100"><td className="break-all py-1.5 pr-2">{l.path}</td><td className="text-right tabular-nums">{l.sessions}</td><td className="w-16 pl-2 text-right text-xs tabular-nums text-slate-400">{Number(l.avg_pv).toFixed(1)}頁</td></tr>))}
              {flow.landings.length === 0 && <tr><td className="py-2 text-slate-400">データなし</td></tr>}
            </tbody></table>
            <p className="mt-1 text-[11px] text-slate-400">列: 訪問数 / 1訪問あたりのページ数</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-bold">その後に見たページ <span className="font-normal text-slate-400">着地の次以降</span></h3>
            <table className="w-full text-sm"><tbody>
              {flow.next_pages.map((p) => (<tr key={p.path} className="border-b border-slate-100"><td className="break-all py-1.5 pr-2">{p.path}</td><td className="text-right tabular-nums">{p.pv}</td></tr>))}
              {flow.next_pages.length === 0 && <tr><td className="py-2 text-slate-400">データなし</td></tr>}
            </tbody></table>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-bold">1訪問で見たページ数</h3>
            <table className="w-full text-sm"><tbody>
              {flow.pv_dist.map((d) => (<tr key={d.ord} className="border-b border-slate-100"><td className="py-1.5 pr-2">{d.label}</td><td className="text-right tabular-nums">{d.sessions}</td></tr>))}
              {flow.pv_dist.length === 0 && <tr><td className="py-2 text-slate-400">データなし</td></tr>}
            </tbody></table>
          </div>
        </div>
        <p className="text-xs text-slate-400">流入元は、タブを開いて最初に見たページにだけ記録されます。1訪問は「同じ日・同じ訪問者」で、日をまたぐ訪問は別に数えます。</p>
      </div>
      <p className="text-xs text-slate-400">IPアドレスは保存しません。訪問者は日替わりの匿名ハッシュで数えます。運営ログイン中のアクセス、ボット、店舗側の画面(ログイン・ダッシュボード・マイページ)は除外。IPベースのため、携帯回線やVPNでは実際の居住地とずれることがあります。</p>
    </div>
  );
}
