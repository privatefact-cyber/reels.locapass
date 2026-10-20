import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMyRoles, hasManagementRole } from "@/lib/auth/roles";
import { PHOTO_ALLOWED_MIME, PHOTO_MAX_BYTES } from "@/lib/photo/tags";
import { moderateAndTag } from "@/lib/photo/moderate";
import { resolveAreaAndVenue } from "@/lib/photo/resolveArea";
import { photoText, AI_LANGUAGE_NAME } from "@/lib/photo/serverText";
import { getR2Client, R2_BUCKET, R2_PUBLIC_BASE_URL } from "@/lib/storage/r2";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { translatePostFields } from "@/lib/photo/translate";
import type { Json } from "@/types/supabase";

export const maxDuration = 60;

const OPERATOR_NAME = "LOCAPASS運営";
const RATE_LIMIT_PER_10MIN = 10;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * エリアフォトの投稿。ログイン中の会員が、写真1枚+場所を投稿する。
 *  1. 画像の形式・サイズを確認  2. AIで公開可否の判定とタグ付け(通らなければ保存しない)
 *  3. ストレージへ保存  4. 位置からエリア(site)と近くの掲載店を自動で決めてDBへ保存
 * 書き込みはRLSをバイパスするため、本人確認とここでの検証が前提(service role)。
 */
export async function POST(request: NextRequest) {
  const { locale, t } = await photoText();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.apiLoginRequired }, { status: 401 });

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: t.apiNoPhoto }, { status: 400 });
  }
  const mime = image.type === "image/jpg" ? "image/jpeg" : image.type;
  if (!(PHOTO_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return NextResponse.json({ error: t.apiBadFormat }, { status: 400 });
  }
  if (image.size > PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: t.errTooLarge15 }, { status: 400 });
  }

  const spotName = text(form.get("spot_name"), 100);
  const comment = text(form.get("comment"), 500);
  const address = text(form.get("address"), 200);
  const latitude = Number(form.get("latitude"));
  const longitude = Number(form.get("longitude"));
  if (!spotName || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: t.apiBadInput }, { status: 400 });
  }

  const admin = createAdminClient();

  // 連投の制限(AIの利用料金と荒らし対策)。
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recent } = await admin
    .from("area_photo_posts")
    .select("id", { count: "exact", head: true })
    .eq("member_id", user.id)
    .gte("created_at", since);
  if ((recent ?? 0) >= RATE_LIMIT_PER_10MIN) {
    return NextResponse.json({ error: t.apiRateLimit }, { status: 429 });
  }

  // 場所タグ(任意): listed=掲載店 / spot=Googleの穴場 / free=手入力のみ。掲載店のIDは実在確認する。
  let placeKind: "listed" | "spot" | "free" = "free";
  let placeId: string | null = null;
  let pickedVenueId: string | null = null;
  const kindParam = text(form.get("place_kind"), 10);
  if (kindParam === "spot") {
    const pid = text(form.get("place_id"), 200);
    if (/^[A-Za-z0-9_-]{10,200}$/.test(pid)) {
      placeKind = "spot";
      placeId = pid;
    }
  } else if (kindParam === "listed") {
    const vid = text(form.get("venue_id"), 40);
    if (/^[0-9a-f-]{36}$/i.test(vid)) {
      const { data: venue } = await admin.from("locapass_venues").select("id").eq("id", vid).maybeSingle();
      if (venue) {
        placeKind = "listed";
        pickedVenueId = venue.id;
      }
    }
  }

  // 動画投稿: 動画本体はブラウザからR2へ直接送信済み。ここでは「自分のフォルダのURLか」「実在して、
  // 形式とサイズが上限内か」を確認する(imageは動画の1コマ=ポスターで、AIの審査・タグ付けもこの1コマで行う)。
  let videoUrl: string | null = null;
  const videoParam = text(form.get("video_url"), 300);
  if (videoParam) {
    const prefix = `${R2_PUBLIC_BASE_URL}/photo/${user.id}/`;
    if (!videoParam.startsWith(prefix) || !/^[0-9]+\.(mp4|mov|webm)$/i.test(videoParam.slice(prefix.length))) {
      return NextResponse.json({ error: t.apiBadInput }, { status: 400 });
    }
    const head = await fetch(videoParam, { method: "HEAD" }).catch(() => null);
    const length = Number(head?.headers.get("content-length") ?? 0);
    const type = (head?.headers.get("content-type") ?? "").split(";")[0];
    if (!head || !head.ok || !VIDEO_TYPES.includes(type)) {
      return NextResponse.json({ error: t.videoNotFound }, { status: 400 });
    }
    if (!length || length > VIDEO_MAX_BYTES) {
      // 上限超過は保存せず、R2からも消す。
      const r2 = getR2Client();
      if (r2) {
        await r2
          .send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: videoParam.slice(R2_PUBLIC_BASE_URL.length + 1) }))
          .catch(() => undefined);
      }
      return NextResponse.json({ error: t.errVideoTooLarge }, { status: 400 });
    }
    videoUrl = videoParam;
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  const moderation = await moderateAndTag(buffer, mime, spotName, comment, AI_LANGUAGE_NAME[locale]);
  if (!moderation.appropriate) {
    return NextResponse.json({ error: moderation.rejectReason ?? t.apiRejected }, { status: 400 });
  }

  // 表示名・アイコン: 会員のプロフィール(locapass_members)。管理側の立場を持つ人は「運営として投稿」を選べる。
  const asOperator = text(form.get("as_operator"), 5) === "true" && hasManagementRole(await fetchMyRoles(supabase));
  const { data: profile } = await supabase.from("locapass_members").select("nickname, avatar_url").eq("id", user.id).maybeSingle();
  const userName = asOperator ? OPERATOR_NAME : (profile?.nickname ?? "ゲスト");
  const avatarUrl = asOperator ? null : (profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined) ?? null);

  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error: uploadError } = await admin.storage.from("map-photos").upload(path, buffer, { contentType: mime });
  if (uploadError) {
    console.error("photo upload failed", uploadError);
    return NextResponse.json({ error: t.apiUploadFailed }, { status: 502 });
  }
  const imageUrl = admin.storage.from("map-photos").getPublicUrl(path).data.publicUrl;

  const { site, venueId: nearestVenueId } = await resolveAreaAndVenue(latitude, longitude);
  const { data: inserted, error: insertError } = await admin
    .from("area_photo_posts")
    .insert({
      member_id: user.id,
      user_name: userName,
      avatar_url: avatarUrl,
      image_url: imageUrl,
      video_url: videoUrl,
      latitude,
      longitude,
      address: address || null,
      spot_name: spotName,
      comment: comment || null,
      tags: moderation.tags,
      site,
      venue_id: pickedVenueId ?? nearestVenueId,
      place_kind: placeKind,
      place_id: placeId,
      place_name: placeKind === "free" ? null : spotName,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error("photo insert failed", insertError);
    await admin.storage.from("map-photos").remove([path]);
    return NextResponse.json({ error: t.apiPostFailed }, { status: 502 });
  }

  // 場所名・一言・住所の自動翻訳は、投稿の返事を待たせないよう裏で行う(失敗しても投稿は成功のまま、原文で表示される)。
  after(async () => {
    const translations = await translatePostFields({ spot_name: spotName, comment: comment || null, address: address || null });
    if (translations) await admin.from("area_photo_posts").update({ translations: translations as unknown as Json }).eq("id", inserted.id);
  });

  return NextResponse.json({ id: inserted.id, site, tags: moderation.tags });
}
