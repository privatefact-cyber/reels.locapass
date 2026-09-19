import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 店舗版の短縮URL(/s/AB12CD)。shop_codeは00023でidentifier用として追加済みだが
// ルーティングには未使用だったため、キャスト版(/c/[code])と同じ形で公開ページへ繋ぐ。
export default async function ShopShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id")
    .eq("shop_code", code.toUpperCase())
    .maybeSingle();

  if (!shop) {
    notFound();
  }

  redirect(`/shops/${shop.id}`);
}
