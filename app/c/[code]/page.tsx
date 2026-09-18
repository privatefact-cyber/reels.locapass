import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// インスタのプロフィール欄などに貼るための短縮URL(/c/AB12CD)。
// 公開プロフィールページ(/cast/[castId])のUUID直リンクは長すぎて改行・文字数制限に
// かかるため、6桁の短いコード(cast_code、shop_codeと同じ発想)から本来のページへ飛ばす。
export default async function CastShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: cast } = await supabase
    .from("cast_members")
    .select("id")
    .eq("cast_code", code.toUpperCase())
    .maybeSingle();

  if (!cast) {
    notFound();
  }

  redirect(`/cast/${cast.id}`);
}
