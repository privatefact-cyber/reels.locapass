import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reservationEnabled, shopCanTakeReservations } from "@/lib/reservation/config";
import { ReserveForm } from "@/components/reservation/ReserveForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "優先予約 | locapass", robots: { index: false } };

export default async function ReservePage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  if (!reservationEnabled() || !/^[0-9a-f-]{36}$/i.test(shopId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/reserve/${shopId}`)}`);

  const admin = createAdminClient();
  const { data: shop } = await (admin as any)
    .from("locapass_shops")
    .select("id, name, plan, status, tel, line_url, cover_url")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop || shop.status !== "active" || !shopCanTakeReservations(shop.plan)) notFound();

  const { data: member } = await admin.from("locapass_members").select("nickname").eq("id", user.id).maybeSingle();
  return <ReserveForm shopId={shop.id} shopName={shop.name} defaultName={member?.nickname ?? ""} stub={!process.env.STRIPE_SECRET_KEY} />;
}
