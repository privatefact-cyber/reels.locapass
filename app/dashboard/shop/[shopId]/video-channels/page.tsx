import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { ChannelManager, type ChannelItem } from "./ChannelManager";

type Row = {
  id: string; channel_id: string; channel_title: string | null; channel_thumb_url: string | null; status: "active" | "paused";
  last_checked_at: string | null; last_imported_at: string | null; last_error: string | null; imported_count: number;
};

/** 店舗オプション「動画の自動追加」: 店のYouTubeチャンネルを登録すると、新しい動画(Shorts)が自動でリールに追加される。 */
export default async function DashboardVideoChannelsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const view = await getShopForManager(shopId);
  if (!view) notFound();
  const shop = view.shop;
  const supabase = (await createClient()) as any;
  const [{ data: opt }, { data: rows }] = await Promise.all([
    supabase.from("locapass_shops").select("auto_video_enabled").eq("id", shop.id).maybeSingle(),
    supabase.from("locapass_shop_youtube_channels").select("id, channel_id, channel_title, channel_thumb_url, status, last_checked_at, last_imported_at, last_error, imported_count").eq("shop_id", shop.id).order("created_at", { ascending: true }),
  ]);
  const enabled = Boolean(opt?.auto_video_enabled);
  // 運営者は、契約がなくても操作できる(代行・確認用)。
  const canUse = enabled || view.isOperator;
  const channels: ChannelItem[] = ((rows ?? []) as Row[]).map((r) => ({
    id: r.id, channelId: r.channel_id, title: r.channel_title, thumbUrl: r.channel_thumb_url, status: r.status,
    lastCheckedAt: r.last_checked_at, lastImportedAt: r.last_imported_at, lastError: r.last_error, importedCount: r.imported_count,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">動画の自動追加</h1>
        <p className="mt-1 text-sm text-slate-600">
          お店のYouTubeチャンネルを登録すると、チャンネルに投稿した新しいショート動画(3分以内)が、数時間おきに自動で見つかって、お店のリールに追加されます。
          登録した直後に、最新の動画から順に最大100本が追加されます。追加された動画は、
          <Link href={`/dashboard/shop/${shopId}/posts`} className="underline">「投稿」</Link>
          から非表示にできます。一度非表示にした動画は、あとから再び追加されることはありません。
        </p>
        {!canUse && (
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
            動画の自動追加は、オプションをご契約のお店でご利用いただけます(現在は未契約です)。
            <Link href={`/dashboard/shop/${shopId}/options`} className="ml-1 underline">オプションの一覧を見る</Link>
          </p>
        )}
        {enabled === false && view.isOperator && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">この店舗は未契約ですが、運営者として操作できます。</p>}
      </section>
      <ChannelManager shopId={shopId} channels={channels} canUse={canUse} />
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">ご注意</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>ご自身のお店のチャンネル、または掲載の権利をお持ちの動画だけを登録してください。</li>
          <li>追加されるのは、公開されていて埋め込みが許可されている、3分以内の動画です。</li>
          <li>動画は、YouTubeの再生画面のままサイト内で再生されます(動画のデータはコピーしません)。</li>
        </ul>
      </section>
    </div>
  );
}
