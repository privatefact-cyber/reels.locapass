import Link from "next/link";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORIES, MAX_NEW_PER_RUN, REGIONS } from "@/lib/overseas/scout";
import { collectOverseas, setHidden, setStar } from "./actions";
import { SubmitButton } from "../social/SubmitButton";

// 検索(YouTube)と要約(Gemini)を続けて呼ぶので、長めにとる。
export const maxDuration = 300;

type Note = {
  id: string; youtube_id: string; title: string; channel_title: string | null; published_at: string | null; duration_seconds: number | null;
  title_ja: string | null; summary_ja: string | null; place_name: string | null; area: string | null; category: string | null; relevant: boolean; starred: boolean; hidden: boolean;
};

const btn = "rounded-lg px-3 py-1.5 text-xs font-semibold";

export default async function OverseasPage({ searchParams }: { searchParams: Promise<{ region?: string; category?: string; view?: string; ok?: string; error?: string }> }) {
  await requireRootAdmin();
  const sp = await searchParams;
  const region = REGIONS.find((r) => r.key === sp.region) ?? REGIONS[0];
  const view = sp.view === "starred" || sp.view === "hidden" || sp.view === "all" ? sp.view : "main";
  const category = (CATEGORIES as readonly string[]).includes(sp.category ?? "") ? sp.category : null;

  const { data } = await (createAdminClient() as any)
    .from("locapass_overseas_notes")
    .select("id, youtube_id, title, channel_title, published_at, duration_seconds, title_ja, summary_ja, place_name, area, category, relevant, starred, hidden")
    .eq("region", region.key)
    .order("created_at", { ascending: false })
    .limit(500);
  const all = (data ?? []) as Note[];
  const notes = all.filter((n) => {
    if (category && n.category !== category) return false;
    if (view === "hidden") return n.hidden;
    if (view === "starred") return n.starred && !n.hidden;
    if (view === "all") return true;
    return !n.hidden && n.relevant;
  });
  const counts = new Map<string, number>();
  for (const n of all.filter((n) => !n.hidden && n.relevant)) counts.set(n.category ?? "その他", (counts.get(n.category ?? "その他") ?? 0) + 1);
  const href = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { region: region.key, view: view === "main" ? undefined : view, category: category ?? undefined, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/admin/overseas?${q.toString()}`;
  };
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:border-slate-500"}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">海外の情報集め({region.label})</h1>
        <p className="text-sm text-slate-600">{region.label}について、YouTubeを検索して、動画の題名・説明を日本語に要約して並べます。個人用の下調べで、一般には公開されません。</p>
      </header>

      {sp.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{sp.error}</p>}

      <form action={collectOverseas} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <input type="hidden" name="region" value={region.key} />
        <p className="text-sm font-semibold text-slate-900">動画を集める</p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          動画の長さ
          <select name="duration" defaultValue="medium" className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
            <option value="medium">4〜20分(Vlog・解説。情報が多い)</option>
            <option value="short">4分未満(ショート)</option>
          </select>
        </label>
        <p className="text-xs text-slate-500">
          {region.queries.length}個の検索語(英語・日本語)で、過去1年の動画を探します。1回に新しく保存するのは最大{MAX_NEW_PER_RUN}本。YouTubeの1日の枠を約{region.queries.length * 101}単位(上限10,000)使います。
        </p>
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold">検索する言葉の一覧({region.queries.length}個)</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {region.queries.map((q) => (
              <li key={q.q}>{q.q}({q.lang === "ja" ? "日本語の動画を優先" : "フィリピンの英語の動画を優先"})</li>
            ))}
          </ul>
          <p className="mt-2 text-slate-500">この言葉をYouTubeの検索窓に入れるのと同じです。ここに書いたものだけが検索されます(世界中を探すわけではありません)。</p>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pendingText="集めています…" slow="YouTubeを検索して日本語に要約しています。1〜3分かかります。画面を閉じずに、このまま待ってください(終わると結果が出ます)。" className={`${btn} bg-slate-900 text-white`}>
            検索して集める
          </SubmitButton>
        </div>
      </form>

      <nav className="flex flex-wrap gap-2">
        <Link href={href({ view: undefined })} className={chip(view === "main")}>おすすめ({all.filter((n) => !n.hidden && n.relevant).length})</Link>
        <Link href={href({ view: "starred" })} className={chip(view === "starred")}>★({all.filter((n) => n.starred && !n.hidden).length})</Link>
        <Link href={href({ view: "all" })} className={chip(view === "all")}>すべて({all.length})</Link>
        <Link href={href({ view: "hidden" })} className={chip(view === "hidden")}>非表示({all.filter((n) => n.hidden).length})</Link>
      </nav>
      <nav className="flex flex-wrap gap-2">
        <Link href={href({ category: undefined })} className={chip(!category)}>全カテゴリ</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={href({ category: c })} className={chip(category === c)}>{c}{counts.get(c) ? `(${counts.get(c)})` : ""}</Link>
        ))}
      </nav>

      {notes.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">まだありません。「検索して集める」を押してください。</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <a href={`https://www.youtube.com/watch?v=${n.youtube_id}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${n.youtube_id}/mqdefault.jpg`} alt="" className="h-20 w-36 rounded-lg object-cover" loading="lazy" />
              </a>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-slate-900">{n.title_ja || n.title}</p>
                {n.title_ja && <p className="truncate text-[11px] text-slate-400">{n.title}</p>}
                {n.summary_ja && <p className="text-sm leading-relaxed text-slate-700">{n.summary_ja}</p>}
                <p className="text-[11px] text-slate-500">
                  {[n.category, n.place_name, n.area].filter(Boolean).join(" ・ ")}
                  {n.channel_title ? ` ／ ${n.channel_title}` : ""}
                  {n.duration_seconds ? ` ／ ${Math.floor(n.duration_seconds / 60)}分` : ""}
                  {n.published_at ? ` ／ ${n.published_at.slice(0, 10)}` : ""}
                </p>
                <div className="flex gap-2 pt-1">
                  <form action={setStar.bind(null, n.id, !n.starred)}>
                    <button className={`${btn} ${n.starred ? "bg-amber-100 text-amber-800" : "border border-slate-300 text-slate-700"}`}>{n.starred ? "★ 外す" : "☆ 保存"}</button>
                  </form>
                  <form action={setHidden.bind(null, n.id, !n.hidden)}>
                    <button className={`${btn} border border-slate-300 text-slate-700`}>{n.hidden ? "戻す" : "非表示"}</button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
