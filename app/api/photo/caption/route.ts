import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCaption } from "@/lib/photo/caption";
import { PHOTO_ALLOWED_MIME } from "@/lib/photo/tags";

export const maxDuration = 60;

// 同じ会員の連打を防ぐ(サーバーのインスタンスごとの簡易制限。AIの利用料金対策)。
const lastCall = new Map<string, number>();
const MIN_INTERVAL_MS = 10_000;
// クライアントが縮小して送る前提。念のためサーバー側でも上限を持つ。
const MAX_BYTES = 6 * 1024 * 1024;

/** 「✨ AIにおまかせ生成」: 写真から店名と一言コメントを作って返す(投稿はしない)。 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const now = Date.now();
  if (now - (lastCall.get(user.id) ?? 0) < MIN_INTERVAL_MS) {
    return NextResponse.json({ error: "少し時間をおいてからもう一度お試しください。" }, { status: 429 });
  }
  lastCall.set(user.id, now);

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0 || image.size > MAX_BYTES) {
    return NextResponse.json({ error: "写真を選択してください。" }, { status: 400 });
  }
  const mime = image.type === "image/jpg" ? "image/jpeg" : image.type;
  if (!(PHOTO_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return NextResponse.json({ error: "対応していない画像形式です。" }, { status: 400 });
  }
  const address = typeof form.get("address") === "string" ? String(form.get("address")).trim().slice(0, 200) : "";

  const result = await generateCaption(Buffer.from(await image.arrayBuffer()), mime, address);
  if (!result) return NextResponse.json({ error: "うまく生成できませんでした。手入力でも投稿できます。" }, { status: 502 });
  return NextResponse.json(result);
}
