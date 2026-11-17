import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { MURMUR_MAX_LENGTH, MURMUR_VISIBLE_DAYS } from "@/lib/murmur/config";
import { murmurRelativeTime } from "@/lib/murmur/labels";
import { MurmurComposer } from "./MurmurComposer";
import { DeleteMurmurButton } from "./DeleteMurmurButton";

type Row = { id: string; body: string; image_url: string | null; created_at: string; author_user_id: string };

/** 店舗管理画面の「ひとこと」。短い文章(と写真1枚)を、スマホからすぐ投稿できる。 */
export default async function DashboardMurmursPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const view = await getShopForManager(shopId);
  if (!view) notFound();
  const shop = view.shop;
  const supabase = (await createClient()) as any;
  const [{ data: rows }, { data: { user } }, { data: isSuper }, { data: shopRow }] = await Promise.all([
    supabase
      .from("locapass_shop_murmurs")
      .select("id, body, image_url, created_at, author_user_id")
      .eq("shop_id", shop.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.auth.getUser(),
    supabase.rpc("locapass_is_super_admin"),
    supabase.from("locapass_shops").select("slug, portal:locapass_portals ( slug )").eq("id", shop.id).maybeSingle(),
  ]);
  const portal = Array.isArray(shopRow?.portal) ? shopRow.portal[0] : shopRow?.portal;
  const archiveHref = shopRow?.slug && portal?.slug ? `/${portal.slug}/shops/${shopRow.slug}/murmurs` : null;
  const items = (rows ?? []) as Row[];
  const now = Date.now();

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">ツイート(ひとこと)</h1>
        <p className="mt-1 text-sm text-slate-600">
          動画を撮らなくても、{MURMUR_MAX_LENGTH}文字までの短い文章を、すぐ投稿できます。写真は1枚つけられます。
          最新の1件は、お店のページに{MURMUR_VISIBLE_DAYS}日間表示されます。過去の分は、ひとこと一覧にずっと残ります。
        </p>
      </section>

      <MurmurComposer shopId={shop.id} />

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">これまでの投稿</h2>
          {archiveHref && (
            <Link href={archiveHref} target="_blank" className="text-xs text-slate-500 underline">
              公開ページで見る ↗
            </Link>
          )}
        </div>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">まだ投稿はありません。</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {items.map((m) => {
              const canDelete = m.author_user_id === user?.id || Boolean(isSuper);
              return (
                <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{m.body}</p>
                  {m.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image_url} alt="" loading="lazy" className="mt-2 max-h-56 rounded-lg border border-slate-200 object-cover" />
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">
                      {murmurRelativeTime(m.created_at, "ja", now)}
                      {now - new Date(m.created_at).getTime() > MURMUR_VISIBLE_DAYS * 86400_000 ? "(お店のページからは非表示)" : ""}
                    </span>
                    {canDelete && <DeleteMurmurButton shopId={shop.id} murmurId={m.id} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
