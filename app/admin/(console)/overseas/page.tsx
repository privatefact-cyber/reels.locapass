import Link from "next/link";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { OVERSEAS_PORTALS } from "@/lib/youtube/shopIngestion";
import { shopPath } from "@/lib/locapass/publicUrls";
import { SubmitButton } from "../social/SubmitButton";
import { buildOverseasShops } from "./actions";

// 検索(YouTube)と店舗の特定(Gemini)を続けて呼ぶので、長めにとる。
export const maxDuration = 300;

const btn = "rounded-lg px-3 py-1.5 text-xs font-semibold";

export default async function OverseasPage({ searchParams }: { searchParams: Promise<{ slug?: string; ok?: string; error?: string }> }) {
  await requireRootAdmin();
  const sp = await searchParams;
  const slug = sp.slug && OVERSEAS_PORTALS[sp.slug] ? sp.slug : "cebu";
  const cfg = OVERSEAS_PORTALS[slug];
  const admin = createAdminClient();
  const { data: portal } = await admin.from("locapass_portals").select("id, slug, name, status").eq("slug", slug).maybeSingle();

  const [{ data: shops }, { data: held }] = portal
    ? await Promise.all([
        admin.from("locapass_shops").select("id, slug, name, address, category, status, lat, lng, created_at").eq("portal_id", portal.id).order("created_at", { ascending: false }).limit(300),
        (admin as any).from("locapass_youtube_ingestions").select("id, title, candidate_name, candidate_address, match_reason, error_message, video_url, created_at").eq("portal_id", portal.id).eq("match_status", "pending").not("match_reason", "is", null).order("created_at", { ascending: false }).limit(40),
      ])
    : [{ data: [] }, { data: [] }];
  const shopList = (shops ?? []) as { id: string; slug: string; name: string; address: string | null; category: string | null; status: string; lat: number | null; lng: number | null }[];
  const heldList = (held ?? []) as { id: string; title: string; candidate_name: string | null; candidate_address: string | null; match_reason: string | null; error_message: string | null; video_url: string }[];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">海外の店舗を集める({cfg.label})</h1>
        <p className="text-sm text-slate-600">
          YouTubeの動画から、店名と住所を見つけて、ロカパスの店舗ページとリールとして公開します(日本の店と同じ仕組みです)。公開先は、ポータル「{portal?.name ?? cfg.label}」です。
        </p>
        {portal && (
          <p className="text-sm">
            <Link href={`/${portal.slug}`} className="text-blue-700 underline" target="_blank">ロカパスで見る: /{portal.slug}</Link>
            <span className="ml-3 text-slate-500">地図: </span>
            <Link href="/map?preset=cebu" className="text-blue-700 underline" target="_blank">/map?preset={portal.slug}</Link>
          </p>
        )}
      </header>

      {sp.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{sp.error}</p>}

      <form action={buildOverseasShops} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <input type="hidden" name="slug" value={slug} />
        <p className="text-sm font-semibold text-slate-900">動画を探して、店舗を作る</p>
        <p className="text-xs text-slate-500">
          YouTube Shorts(3分以内)を、次の言葉で探します。店名と住所がはっきり分かった動画だけ、店舗として公開します。複数の店をまとめた動画(TOP10など)や、住所の裏付けが弱いものは、保留にします。1回に判定するのは最大12本です(押すたびに、新しい分が進みます)。
        </p>
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold">検索する言葉({cfg.queries.length}個)</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {cfg.queries.map((q) => (<li key={q.q}>{q.q}</li>))}
          </ul>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pendingText="集めています…" slow="動画を探して、店名・住所を調べて、店舗を作っています。2〜3分かかります。画面を閉じずに、このまま待ってください(終わると結果が出ます)。" className={`${btn} bg-slate-900 text-white`}>
            動画を探して店舗を作る
          </SubmitButton>
        </div>
      </form>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-slate-900">公開した店舗({shopList.length})</h2>
        {shopList.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">まだありません。上のボタンを押してください。</p>
        ) : (
          <ul className="space-y-2">
            {shopList.map((s) => (
              <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={shopPath(slug, s.slug)} target="_blank" className="text-sm font-semibold text-blue-700 underline">{s.name}</Link>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{s.category}</span>
                  {s.status !== "active" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">非公開</span>}
                  {s.lat === null && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] text-rose-800">地図に出ません</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{s.address}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {heldList.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">保留の候補({heldList.length})</h2>
          <p className="text-xs text-slate-500">店名・住所が確かめられなかった動画です。理由を見て、必要なら「YouTube収集・動画ストック」で、店名と住所を手で入れて公開できます。</p>
          <ul className="space-y-2">
            {heldList.map((h) => (
              <li key={h.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <a href={h.video_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-blue-700 underline">{h.title}</a>
                <p className="mt-1 text-slate-600">{h.error_message || h.match_reason}</p>
                {h.candidate_name && <p className="text-slate-500">候補: {h.candidate_name} / {h.candidate_address}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
