import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { TodaySpotManager, type SpotRow } from "@/components/locapass-dashboard/TodaySpotManager";

export const dynamic = "force-dynamic";

export default async function TodaySpotPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();

  const supabase = (await createClient()) as any;
  const { data: portal } = await supabase.from("locapass_portals").select("features").eq("id", viewer.shop.portal_id).maybeSingle();
  if (!(portal?.features ?? []).includes("mobile")) notFound();

  const { data, error } = await supabase
    .from("locapass_shop_events")
    .select("id, body, starts_at, ends_at, lat, lng, address")
    .eq("shop_id", shopId)
    .not("lat", "is", null)
    .order("starts_at", { ascending: false })
    .limit(200);

  const now = Date.now();
  const rows: SpotRow[] = (data ?? [])
    .filter((e: any) => e.starts_at && e.ends_at)
    .map((e: any) => ({ id: e.id, startsAt: e.starts_at, endsAt: e.ends_at, address: e.address, lat: e.lat, lng: e.lng, note: e.body }));
  const active = rows.filter((r) => Date.parse(r.startsAt) <= now && Date.parse(r.endsAt) >= now);
  const upcoming = rows.filter((r) => Date.parse(r.startsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const past = rows.filter((r) => Date.parse(r.endsAt) < now);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">今日の出店</h1>
      {error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">位置の列がまだ用意されていません(データベースの準備が必要です)。</p>
      ) : (
        <TodaySpotManager shopId={shopId} active={active} upcoming={upcoming} past={past} />
      )}
    </div>
  );
}
