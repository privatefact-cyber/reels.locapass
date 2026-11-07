import Link from "next/link";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PREFECTURES } from "@/lib/analytics/prefectures";

export const dynamic = "force-dynamic";

type Row = { path: string; pv?: number; uv?: number };
type Summary = {
  pv: number;
  uv: number;
  daily: { day: string; pv: number; uv: number }[];
  pages: Row[];
  landing: Row[];
  refs: { host: string; pv: number }[];
  devices: { device: string; uv: number }[];
  prefs: { pref_code: string; uv: number }[];
  sent: { pv: number; uv: number; shop_pv: number; shop_uv: number; photo_pv: number; shops: Row[]; pages: Row[] };
  usage: Record<string, number> & { documents_by_type: Record<string, number> };
  breeds: { breed: string; n: number }[];
};

const RANGES = [
  { days: 7, label: "直近7日" },
  { days: 30, label: "直近30日" },
  { days: 90, label: "直近90日" },
  { days: 365, label: "直近1年" },
];
const DEVICE_LABEL: Record<string, string> = { mobile: "スマホ", tablet: "タブレット", desktop: "PC" };
const DOC_LABEL: Record<string, string> = { rabies: "狂犬病", license: "鑑札", mixed_vaccine: "混合ワクチン", insurance: "ペット保険", other: "その他" };
/** ページのパスを、見て分かる名前に */
const PAGE_LABEL: [RegExp, string][] = [
  [/^\/pet$/, "ホーム(うちの子)"],
  [/^\/pet\/spots$/, "おでかけ(地図)"],
  [/^\/pet\/place\/:id$/, "施設ページ"],
  [/^\/pet\/gallery$/, "うちの子自慢"],
  [/^\/pet\/gallery\/:id$/, "自慢の投稿ページ"],
  [/^\/pet\/post$/, "投稿の入口"],
  [/^\/pet\/lost$/, "迷子さがし"],
  [/^\/pet\/lost\/:id$/, "迷子のお知らせページ"],
  [/^\/pet\/found\/new$/, "見つけました通報(入力)"],
  [/^\/pet\/found\/:id$/, "見つけました通報ページ"],
  [/^\/pet\/t\/:code$/, "名刺・迷子QR(読み取られた)"],
  [/^\/pet\/:id\/lost$/, "迷子のお知らせを出す"],
  [/^\/pet\/:id\/tag$/, "名刺・QRの作成"],
  [/^\/pet\/:id$/, "うちの子の詳細"],
  [/^\/pet\/new$/, "うちの子の登録"],
  [/^\/pet\/login$/, "ログイン・会員登録"],
  [/^\/pet\/settings$/, "設定"],
  [/^\/pet\/follows$/, "フォロー"],
];
const pageName = (p: string) => PAGE_LABEL.find(([re]) => re.test(p))?.[1] ?? null;

function jstDate(offsetDays: number) {
  return new Date(Date.now() + 9 * 3600 * 1000 - offsetDays * 86400000).toISOString().slice(0, 10);
}

/** ロカわん専用の解析。アクセスは site_hits の /pet 配下、利用状況は locapass_pet_* の件数。全ポータル横断なので super_admin のみ */
export default async function PetAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireRootAdmin();
  const sp = await searchParams;
  const days = RANGES.some((r) => r.days === Number(sp.days)) ? Number(sp.days) : 30;
  const since = jstDate(days - 1);
  const supabase = createAdminClient();
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string, args: object) => Promise<{ data: Summary | null; error: { message: string } | null }>;
  }).rpc("locapass_pet_analytics", { p_since: since });
  if (!data) return <p className="rounded bg-rose-50 p-3 text-sm text-rose-700">集計の取得に失敗しました: {error?.message}</p>;
  const s = data;
  const u = s.usage;

  const dailyMap = new Map(s.daily.map((d) => [d.day, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = jstDate(days - 1 - i);
    return { day: d, pv: dailyMap.get(d)?.pv ?? 0, uv: dailyMap.get(d)?.uv ?? 0 };
  });
  const maxPv = Math.max(1, ...series.map((d) => d.pv));
  const W = 760;
  const H = 150;
  const line = (key: "pv" | "uv") =>
    series.map((d, i) => `${((series.length > 1 ? i / (series.length - 1) : 0.5) * W).toFixed(1)},${(H - (d[key] / maxPv) * (H - 10) - 2).toFixed(1)}`).join(" ");
  const sendRate = s.uv ? Math.round((s.sent.uv / s.uv) * 100) : 0;

  const Kpi = ({ v, l, sub }: { v: string | number; l: string; sub?: string }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-2xl font-bold text-orange-700">{typeof v === "number" ? v.toLocaleString() : v}</div>
      <div className="text-xs text-slate-500">{l}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
  const plus = (n: number) => (n > 0 ? `期間内 +${n}` : "期間内 0");
  const Table = ({ title, note, rows }: { title: string; note?: string; rows: { k: string; sub?: string | null; v: number; v2?: number }[] }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-bold">
        {title} {note && <span className="font-normal text-slate-400">— {note}</span>}
      </h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="border-b border-slate-100">
              <td className="break-all py-1.5 pr-2">
                {r.sub ? (
                  <>
                    {r.sub}
                    <span className="block text-[11px] text-slate-400">{r.k}</span>
                  </>
                ) : (
                  r.k
                )}
              </td>
              <td className="text-right tabular-nums">{r.v}</td>
              {r.v2 !== undefined && <td className="pl-2 text-right tabular-nums text-slate-400">{r.v2}</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="py-2 text-slate-400">データなし</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-bold">
          🐾 ロカわん解析 <span className="text-xs font-normal text-slate-400">locapass.net/pet</span>
        </h1>
        {RANGES.map((r) => (
          <Link
            key={r.days}
            href={`/admin/pets/analytics?days=${r.days}`}
            className={`rounded-full border px-3 py-1 text-sm ${r.days === days ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
          >
            {r.label}
          </Link>
        ))}
        <Link href="/admin/pets" className="ml-auto text-sm text-blue-700 hover:underline">
          迷子さがし・自慢の確認へ ›
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">アクセス(期間内)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi v={s.pv} l="ページビュー" />
          <Kpi v={s.uv} l="訪問者数(日別ユニーク合計)" />
          <Kpi v={s.sent.uv} l="LOCAPASSへ送った訪問者" sub={`ロカわん訪問者の${sendRate}%`} />
          <Kpi v={s.sent.shop_pv} l="LOCAPASSのお店ページの閲覧" sub={`${s.sent.shop_uv}人 / snap閲覧 ${s.sent.photo_pv}`} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-bold">
            日別推移 <span className="font-normal text-slate-400">— 濃線: ページビュー / 淡線: 訪問者</span>
          </h3>
          <svg viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" className="h-auto w-full">
            <polyline fill="none" stroke="#c2410c" strokeWidth="2" points={line("pv")} />
            <polyline fill="none" stroke="#fdba74" strokeWidth="2" points={line("uv")} />
            <text x="0" y={H + 14} fontSize="11" fill="#64748b">
              {series[0].day}
            </text>
            <text x={W} y={H + 14} fontSize="11" textAnchor="end" fill="#64748b">
              {series[series.length - 1].day}(最大 {maxPv})
            </text>
          </svg>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">
          利用状況 <span className="font-normal text-slate-400">— 大きい数字は累計、小さい数字は期間内の新規</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi v={u.pets} l="登録された犬" sub={plus(u.pets_new)} />
          <Kpi v={u.owners} l="飼い主(犬を登録した会員)" sub={`${plus(u.owners_new)} / 多頭飼い ${u.multi_pet_owners}`} />
          <Kpi v={u.owners_joined_via_pet} l="ロカわんで会員になった人" sub="会員登録から24時間以内に犬を登録" />
          <Kpi v={u.gallery} l="うちの子自慢の投稿" sub={plus(u.gallery_new)} />
          <Kpi v={u.snap} l="snapにも投稿" sub={plus(u.snap_new)} />
          <Kpi v={u.likes} l="肉球" sub={plus(u.likes_new)} />
          <Kpi v={u.diary} l="成長日誌(非公開含む)" sub={plus(u.diary_new)} />
          <Kpi v={u.documents} l="ワクチン等の書類" sub={`${plus(u.documents_new)}${Object.keys(u.documents_by_type).length ? " / " + Object.entries(u.documents_by_type).map(([k, n]) => `${DOC_LABEL[k] ?? k}${n}`).join("・") : ""}`} />
          <Kpi v={u.medical} l="通院の記録" />
          <Kpi v={u.follows} l="フォロー(承認済み)" sub={`承認待ち ${u.follows_pending}`} />
          <Kpi v={u.line_linked} l="LINE通知をつないだ人" />
          <Kpi v={u.push_owners} l="プッシュ通知オンの飼い主" />
          <Kpi v={u.lost_active} l="迷子のお知らせ中" sub={`累計 ${u.lost_total} / 見つかった ${u.lost_found}`} />
          <Kpi v={u.found_open} l="見つけました通報(受付中)" sub={`累計 ${u.found_total} / ログインなし ${u.found_guest}`} />
          <Kpi v={u.walk_area_users} l="散歩エリアを設定した人" sub="迷子アラートの受け取り手" />
          <Kpi v={u.card_public} l="名刺・迷子QRを公開中の犬" />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Table title="よく見られたページ" note="PV / 訪問者" rows={s.pages.map((p) => ({ k: p.path, sub: pageName(p.path), v: p.pv ?? 0, v2: p.uv }))} />
        <Table title="最初に開いたページ" note="入口。QR・共有リンクからの流入が分かる" rows={s.landing.map((p) => ({ k: p.path, sub: pageName(p.path), v: p.uv ?? 0 }))} />
        <Table title="ロカわんの後に見たLOCAPASSのページ" note="送客先(同じ日・同じ訪問者)" rows={s.sent.pages.map((p) => ({ k: p.path, v: p.pv ?? 0 }))} />
        <Table title="送客したお店のページ" rows={s.sent.shops.map((p) => ({ k: p.path, v: p.pv ?? 0 }))} />
        <Table title="流入元" rows={s.refs.map((r) => ({ k: r.host, v: r.pv }))} />
        <Table
          title="地域・端末"
          note="訪問者"
          rows={[...s.prefs.map((p) => ({ k: PREFECTURES[p.pref_code] ?? p.pref_code, v: p.uv })), ...s.devices.map((d) => ({ k: `端末: ${DEVICE_LABEL[d.device] ?? d.device}`, v: d.uv }))]}
        />
        <Table title="登録された犬種" note="累計" rows={s.breeds.map((b) => ({ k: b.breed, v: b.n }))} />
      </div>

      <p className="text-xs text-slate-400">
        アクセスはLOCAPASSのアクセス解析と同じ記録(IPは保存せず、日替わりの匿名ハッシュ。運営ログイン中とボットは除外)から /pet 配下だけを数えています。
        「LOCAPASSへ送った」は、同じ日にロカわんを見た訪問者が、その後にロカわん以外のLOCAPASSのページを見た数です(日をまたぐと別人扱い)。「ロカわんで会員になった人」は会員登録から24時間以内に犬を登録した人の数で、目安です。
      </p>
    </div>
  );
}
