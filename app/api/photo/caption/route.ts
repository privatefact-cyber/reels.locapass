import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCaption } from "@/lib/photo/caption";
import { PHOTO_ALLOWED_MIME } from "@/lib/photo/tags";
import { photoText, AI_LANGUAGE_NAME } from "@/lib/photo/serverText";

export const maxDuration = 60;

// 同じ会員の連打を防ぐ(サーバーのインスタンスごとの簡易制限。AIの利用料金対策)。
const lastCall = new Map<string, number>();
const MIN_INTERVAL_MS = 10_000;
// クライアントが縮小して送る前提。念のためサーバー側でも上限を持つ。
const MAX_BYTES = 6 * 1024 * 1024;

/** 「✨ AIにおまかせ生成」: 写真から店名と一言コメントを作って返す(投稿はしない)。 */
export async function POST(request: NextRequest) {
  const { locale, t } = await photoText();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.apiLoginRequired }, { status: 401 });

  const now = Date.now();
  if (now - (lastCall.get(user.id) ?? 0) < MIN_INTERVAL_MS) {
    return NextResponse.json({ error: t.apiWaitMoment }, { status: 429 });
  }
  lastCall.set(user.id, now);

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0 || image.size > MAX_BYTES) {
    return NextResponse.json({ error: t.apiNoPhoto }, { status: 400 });
  }
  const mime = image.type === "image/jpg" ? "image/jpeg" : image.type;
  if (!(PHOTO_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return NextResponse.json({ error: t.apiBadFormat }, { status: 400 });
  }
  const address = typeof form.get("address") === "string" ? String(form.get("address")).trim().slice(0, 200) : "";

  const result = await generateCaption(Buffer.from(await image.arrayBuffer()), mime, address, AI_LANGUAGE_NAME[locale]);
  if (!result) return NextResponse.json({ error: t.errAiFailed }, { status: 502 });
  return NextResponse.json(result);
}
