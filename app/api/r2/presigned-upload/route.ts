import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { getR2Client, R2_BUCKET, R2_PUBLIC_BASE_URL } from "@/lib/storage/r2";

// 動画のR2アップロード用URLを発行する。呼び出し元(投稿主体)に応じて4通りの
// 権限チェックを行う(LUXELA本家と同じ思想):
// - cast_self: キャスト本人がマイページから投稿
// - staff_self: スタッフ本人がマイページから投稿
// - shop_on_behalf_of_cast: 店舗管理者が所属キャストの代わりに投稿(ダッシュボード)
// - shop_self: 店舗自身の投稿(ダッシュボード)
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = getR2Client();
  if (!client) return NextResponse.json({ error: "R2 is not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const { ext, contentType, context, castId: targetCastId, shopId: targetShopId } = body ?? {};
  const safeExt = typeof ext === "string" && /^[a-zA-Z0-9]{1,8}$/.test(ext) ? ext : "mp4";

  let folderId: string;

  if (context === "staff_self") {
    const { data: staffId } = await supabase.rpc("locapass_current_staff_member_id");
    if (!staffId) return NextResponse.json({ error: "スタッフとして認証されていません" }, { status: 403 });
    folderId = staffId;
  } else if (context === "shop_on_behalf_of_cast") {
    if (typeof targetCastId !== "string" || !targetCastId) {
      return NextResponse.json({ error: "castIdが指定されていません" }, { status: 400 });
    }
    const { data: cast } = await supabase
      .from("locapass_cast_members")
      .select("shop_id")
      .eq("id", targetCastId)
      .maybeSingle();
    const { data: canManage } = cast
      ? await supabase.rpc("locapass_is_shop_admin", { p_shop_id: cast.shop_id })
      : { data: false };
    if (!cast || !canManage) {
      return NextResponse.json({ error: "このパートナーへの投稿権限がありません" }, { status: 403 });
    }
    folderId = targetCastId;
  } else if (context === "shop_self") {
    if (typeof targetShopId !== "string" || !targetShopId) {
      return NextResponse.json({ error: "shopIdが指定されていません" }, { status: 400 });
    }
    const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: targetShopId });
    if (!canManage) {
      return NextResponse.json({ error: "この店舗への投稿権限がありません" }, { status: 403 });
    }
    folderId = targetShopId;
  } else {
    const { data: castId } = await supabase.rpc("locapass_current_cast_id");
    if (!castId) return NextResponse.json({ error: "パートナーとして認証されていません" }, { status: 403 });
    folderId = castId;
  }

  const key = `reels/${folderId}/${Date.now()}.${safeExt}`;

  const uploadURL = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: typeof contentType === "string" ? contentType : "video/mp4",
      CacheControl: "public, max-age=31536000, immutable",
    }),
    { expiresIn: 300 },
  );

  return NextResponse.json({ uploadURL, publicUrl: `${R2_PUBLIC_BASE_URL}/${key}` });
}
