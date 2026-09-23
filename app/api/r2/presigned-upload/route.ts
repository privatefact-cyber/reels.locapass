import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { getR2Client, R2_BUCKET, R2_PUBLIC_BASE_URL } from "@/lib/storage/r2";

// キャスト自身の投稿(cast mypage)専用。shop_id経由の代理投稿はまだこのルートを使わない。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: castId } = await supabase.rpc("locapass_current_cast_id");
  if (!castId) return NextResponse.json({ error: "キャストとして認証されていません" }, { status: 403 });

  const client = getR2Client();
  if (!client) return NextResponse.json({ error: "R2 is not configured" }, { status: 503 });

  const { ext, contentType } = await request.json().catch(() => ({}));
  const safeExt = typeof ext === "string" && /^[a-zA-Z0-9]{1,8}$/.test(ext) ? ext : "mp4";
  const key = `reels/${castId}/${Date.now()}.${safeExt}`;

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
