"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { OVERSEAS_PORTALS, collectAndBuildOverseas } from "@/lib/youtube/shopIngestion";

const PATH = "/admin/overseas";

/** 動画を探し、店名・住所を特定して、ロカパスの店舗とリールとして公開する(1回あたり時間内に終わる分だけ)。 */
export async function buildOverseasShops(formData: FormData) {
  await requireRootAdmin();
  const slug = String(formData.get("slug") ?? "cebu");
  if (!OVERSEAS_PORTALS[slug]) redirect(`${PATH}?error=${encodeURIComponent("不明な地域です")}`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let message: string;
  try {
    const r = await collectAndBuildOverseas(slug, { userId: user?.id ?? null });
    message = `検索${r.queries}回 → 動画${r.found}本(新しい候補${r.saved}本)→ 判定${r.scanned}本: 店舗として公開${r.published}件 / 保留${r.held}件 / 判定エラー${r.errors}件${r.errors > 0 ? "(下の「保留の候補」で理由を確認)" : ""}${r.searchErrors.length ? ` / 検索の失敗: ${r.searchErrors.slice(0, 2).join(" ・ ")}` : ""}`;
  } catch (e) {
    redirect(`${PATH}?slug=${slug}&error=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 300) : "失敗しました")}`);
  }
  revalidatePath(PATH);
  revalidatePath("/");
  revalidatePath("/map");
  redirect(`${PATH}?slug=${slug}&ok=${encodeURIComponent(message)}`);
}
