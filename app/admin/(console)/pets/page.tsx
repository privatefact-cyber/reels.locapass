import Link from "next/link";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { petAdmin } from "@/lib/pet/db";
import { clearPetFlags, deleteFoundReportAsAdmin, setPetReportHidden } from "./actions";

export const dynamic = "force-dynamic";

type Row = {
  type: "lost" | "found" | "diary";
  id: string;
  title: string;
  status: string;
  address: string | null;
  createdAt: string;
  hidden: boolean;
  flags: number;
  reasons: string[];
  href: string;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** ロカわんの迷子さがし(迷子のお知らせ・見つけました通報)の確認。全ポータル横断なので super_admin のみ。 */
export default async function AdminPetsPage() {
  await requireRootAdmin();
  const admin = petAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ data: lost }, { data: found }, { data: flags }, { data: diaries }] = await Promise.all([
    admin
      .from("locapass_pet_lost_reports")
      .select("id, pet_id, status, last_seen_address, created_at, hidden_at")
      .or(`status.eq.active,created_at.gte.${since}`)
      .order("created_at", { ascending: false })
      .limit(300),
    admin.from("locapass_pet_found_reports").select("id, kind, species, status, address, created_at, hidden_at").order("created_at", { ascending: false }).limit(300),
    admin.from("locapass_pet_flags").select("target_type, target_id, reason").limit(5000),
    admin
      .from("locapass_pet_diary_entries")
      .select("id, pet_id, body, created_at, hidden_at, snap_post_id")
      .eq("visibility", "public")
      .neq("image_paths", "{}")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  const petIds = [...new Set([...(lost ?? []), ...(diaries ?? [])].map((l) => l.pet_id as string))];
  const { data: pets } = petIds.length ? await admin.from("locapass_pets").select("id, name").in("id", petIds) : { data: [] };
  const petName = new Map((pets ?? []).map((p) => [p.id as string, p.name as string]));

  const flagMap = new Map<string, string[]>();
  for (const f of flags ?? []) {
    const k = `${f.target_type}:${f.target_id}`;
    flagMap.set(k, [...(flagMap.get(k) ?? []), (f.reason as string | null) ?? "理由なし"]);
  }

  const rows: Row[] = [
    ...(lost ?? []).map((l) => ({
      type: "lost" as const,
      id: l.id as string,
      title: `迷子: ${petName.get(l.pet_id as string) ?? "?"}`,
      status: l.status === "active" ? "お知らせ中" : l.status === "found" ? "見つかった" : "終了",
      address: l.last_seen_address as string | null,
      createdAt: l.created_at as string,
      hidden: Boolean(l.hidden_at),
      flags: flagMap.get(`lost:${l.id}`)?.length ?? 0,
      reasons: flagMap.get(`lost:${l.id}`) ?? [],
      href: `/pet/lost/${l.id}`,
    })),
    ...(found ?? []).map((f) => ({
      type: "found" as const,
      id: f.id as string,
      title: `${f.kind === "protected" ? "保護" : "目撃"}: ${f.species === "dog" ? "犬" : f.species === "cat" ? "猫" : "その他"}`,
      status: f.status === "open" ? "受付中" : "解決",
      address: f.address as string | null,
      createdAt: f.created_at as string,
      hidden: Boolean(f.hidden_at),
      flags: flagMap.get(`found:${f.id}`)?.length ?? 0,
      reasons: flagMap.get(`found:${f.id}`) ?? [],
      href: `/pet/found/${f.id}`,
    })),
    ...(diaries ?? []).map((d) => ({
      type: "diary" as const,
      id: d.id as string,
      title: `自慢: ${petName.get(d.pet_id as string) ?? "?"}${d.body ? ` 「${(d.body as string).slice(0, 20)}」` : ""}`,
      status: d.snap_post_id ? "公開+snap" : "公開",
      address: null,
      createdAt: d.created_at as string,
      hidden: Boolean(d.hidden_at),
      flags: flagMap.get(`diary:${d.id}`)?.length ?? 0,
      reasons: flagMap.get(`diary:${d.id}`) ?? [],
      href: `/pet/gallery/${d.id}`,
    })),
  ].sort((a, b) => b.flags - a.flags || b.createdAt.localeCompare(a.createdAt));

  const flagged = rows.filter((r) => r.flags > 0);

  const Table = ({ list }: { list: Row[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="py-2 pr-3">内容</th>
            <th className="py-2 pr-3">状態</th>
            <th className="py-2 pr-3">場所</th>
            <th className="py-2 pr-3">投稿</th>
            <th className="py-2 pr-3">報告</th>
            <th className="py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={`${r.type}-${r.id}`} className={`border-b border-slate-100 align-top ${r.hidden ? "bg-slate-50 text-slate-400" : ""}`}>
              <td className="py-2 pr-3">
                <Link href={r.href} target="_blank" className="font-semibold text-blue-700 hover:underline">
                  {r.title}
                </Link>
                {r.hidden && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">非表示中</span>}
              </td>
              <td className="py-2 pr-3">{r.status}</td>
              <td className="max-w-[220px] truncate py-2 pr-3">{r.address ?? "ー"}</td>
              <td className="whitespace-nowrap py-2 pr-3">{fmt(r.createdAt)}</td>
              <td className="py-2 pr-3">
                {r.flags > 0 ? (
                  <span className="text-red-600" title={r.reasons.join(" / ")}>
                    {r.flags}件<span className="block text-[11px] text-slate-500">{[...new Set(r.reasons)].join("、")}</span>
                  </span>
                ) : (
                  "ー"
                )}
              </td>
              <td className="py-2">
                <div className="flex flex-wrap gap-2">
                  <form action={setPetReportHidden.bind(null, r.type, r.id, !r.hidden)}>
                    <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
                      {r.hidden ? "再表示" : "非表示にする"}
                    </button>
                  </form>
                  {r.flags > 0 && (
                    <form action={clearPetFlags.bind(null, r.type, r.id)}>
                      <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
                        問題なし(報告を消す)
                      </button>
                    </form>
                  )}
                  {r.type === "found" && (
                    <form action={deleteFoundReportAsAdmin.bind(null, r.id)}>
                      <button type="submit" className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                        削除
                      </button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-slate-900">迷子さがし・うちの子自慢(ロカわん)</h1>
        <p className="mt-1 text-sm text-slate-600">
          迷子のお知らせ・「見つけました」通報・うちの子自慢ギャラリーの確認。いたずら・重複は「非表示」にすると、一覧・地図・共有ページから消えます。迷子のお知らせは飼い主のものなので削除せず非表示で対応します。悪質な投稿者は
          <Link href="/admin/comments" className="mx-1 text-blue-700 hover:underline">
            コメント管理
          </Link>
          でBANすると、迷子さがしにも投稿できなくなります。
        </p>
      </section>

      <section className="rounded-xl border border-red-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">不適切の報告があるもの({flagged.length})</h2>
        {flagged.length === 0 ? <p className="text-sm text-slate-500">報告はありません</p> : <Table list={flagged} />}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">最近の投稿(迷子のお知らせはお知らせ中+30日以内、通報・うちの子自慢は最新300件)</h2>
        {rows.length === 0 ? <p className="text-sm text-slate-500">まだありません</p> : <Table list={rows} />}
      </section>
    </div>
  );
}
