import { geminiGenerateWithFallback } from "@/lib/gemini";
import { petAdmin, signPetImages } from "./db";
import { ageLabel, todayJst } from "./calc";

/**
 * ロカわん「うちの子自慢ギャラリー」。
 * 成長日誌のうち、公開(visibility='public')で写真がある・非表示にされていないものを並べる。
 * 位置は持たない。「場所を付けてsnapにも投稿」したものだけ snap(area_photo_posts)への入口を出す。
 * 他人に見せるので petAdmin で読み、返す列はここで絞る(体重・飼い主の情報は出さない)。
 */

export type GalleryItem = {
  id: string;
  imageUrls: string[];
  body: string | null;
  createdAt: string;
  likeCount: number;
  liked: boolean;
  pet: { id: string; name: string; breed: string | null; sex: string; age: string | null; avatarUrl: string | null; cardCode: string | null };
  snap: { id: string; spotName: string | null } | null;
};

export type GallerySort = "new" | "popular";

const SELECT =
  "id, pet_id, owner_id, body, image_paths, created_at, like_count, snap_post_id, pet:locapass_pets!inner(id, name, breed, sex, birthday, birthday_estimated, avatar_path, tag_code, card_public), snap:area_photo_posts(id, spot_name)";

type Row = {
  id: string;
  pet_id: string;
  owner_id: string;
  body: string | null;
  image_paths: string[];
  created_at: string;
  like_count: number;
  snap_post_id: string | null;
  pet: { id: string; name: string; breed: string | null; sex: string; birthday: string | null; birthday_estimated: boolean | null; avatar_path: string | null; tag_code: string; card_public: boolean };
  snap: { id: string; spot_name: string | null } | null;
};

function publicGallery() {
  return petAdmin()
    .from("locapass_pet_diary_entries")
    .select(SELECT)
    .eq("visibility", "public")
    .is("hidden_at", null)
    .neq("image_paths", "{}");
}

async function toItems(rows: Row[], viewerId: string | null): Promise<GalleryItem[]> {
  if (rows.length === 0) return [];
  const [signed, likedSet] = await Promise.all([
    signPetImages(rows.flatMap((r) => [...r.image_paths, r.pet.avatar_path])),
    likedBy(viewerId, rows.map((r) => r.id)),
  ]);
  return rows.map((r) => ({
    id: r.id,
    imageUrls: r.image_paths.map((p) => signed.get(p)).filter((u): u is string => Boolean(u)),
    body: r.body,
    createdAt: r.created_at,
    likeCount: r.like_count,
    liked: likedSet.has(r.id),
    pet: {
      id: r.pet.id,
      name: r.pet.name,
      breed: r.pet.breed,
      sex: r.pet.sex,
      age: ageLabel(r.pet.birthday, Boolean(r.pet.birthday_estimated)),
      avatarUrl: r.pet.avatar_path ? (signed.get(r.pet.avatar_path) ?? null) : null,
      // 名刺ページ(フォローの入口)は、飼い主が名刺を公開しているときだけ
      cardCode: r.pet.card_public ? r.pet.tag_code : null,
    },
    snap: r.snap ? { id: r.snap.id, spotName: r.snap.spot_name } : null,
  }));
}

async function likedBy(viewerId: string | null, ids: string[]): Promise<Set<string>> {
  if (!viewerId || ids.length === 0) return new Set();
  const { data } = await petAdmin().from("locapass_pet_diary_likes").select("entry_id").eq("user_id", viewerId).in("entry_id", ids);
  return new Set((data ?? []).map((r) => r.entry_id as string));
}

export const GALLERY_PAGE_SIZE = 30;

export async function getGallery(opts: { sort: GallerySort; breed?: string | null; page?: number; viewerId: string | null }): Promise<{ items: GalleryItem[]; hasMore: boolean }> {
  const page = Math.max(0, Math.min(50, opts.page ?? 0));
  let q = publicGallery();
  if (opts.breed) q = q.eq("pet.breed", opts.breed);
  if (opts.sort === "popular") {
    // 人気: 直近90日の中で肉球の多い順
    q = q.gte("created_at", new Date(Date.now() - 90 * 86400_000).toISOString()).order("like_count", { ascending: false });
  }
  const { data, error } = await q.order("created_at", { ascending: false }).range(page * GALLERY_PAGE_SIZE, page * GALLERY_PAGE_SIZE + GALLERY_PAGE_SIZE);
  if (error) console.error("[pet-gallery] list failed", error);
  const rows = (data ?? []) as unknown as Row[];
  const hasMore = rows.length > GALLERY_PAGE_SIZE;
  return { items: await toItems(rows.slice(0, GALLERY_PAGE_SIZE), opts.viewerId), hasMore };
}

export async function getGalleryItem(id: string, viewerId: string | null): Promise<(GalleryItem & { ownerId: string }) | null> {
  const { data } = await publicGallery().eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as unknown as Row;
  const [item] = await toItems([row], viewerId);
  return { ...item, ownerId: row.owner_id };
}

/** 絞り込み用: ギャラリーに出ている犬種(多い順) */
export async function getGalleryBreeds(): Promise<string[]> {
  const { data } = await publicGallery().order("created_at", { ascending: false }).limit(500);
  const count = new Map<string, number>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const b = r.pet.breed?.trim();
    if (b) count.set(b, (count.get(b) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b).slice(0, 30);
}

/** 今週の看板犬: 直近7日で肉球の多い投稿(同じ子は1回だけ) */
export async function getWeeklyTop(viewerId: string | null, limit = 3): Promise<GalleryItem[]> {
  const { data } = await publicGallery()
    .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
    .gt("like_count", 0)
    .order("like_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);
  const seen = new Set<string>();
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => (seen.has(r.pet_id) ? false : (seen.add(r.pet_id), true))).slice(0, limit);
  return toItems(rows, viewerId);
}

/** 新着(ホームの帯用、同じ子は1回だけ) */
export async function getLatestGallery(viewerId: string | null, limit = 10): Promise<GalleryItem[]> {
  const { data } = await publicGallery().order("created_at", { ascending: false }).limit(40);
  const seen = new Set<string>();
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => (seen.has(r.pet_id) ? false : (seen.add(r.pet_id), true))).slice(0, limit);
  return toItems(rows, viewerId);
}

/** きょう誕生日の子(ギャラリーに公開写真がある子だけ)。それぞれの一番新しい公開写真を付ける */
export async function getTodayBirthdays(viewerId: string | null): Promise<GalleryItem[]> {
  const md = todayJst().slice(5); // "MM-DD"
  const { data: ids } = await petAdmin().rpc("locapass_pet_today_birthdays", { p_md: md });
  const petIds = ((ids ?? []) as { pet_id: string }[]).map((r) => r.pet_id);
  if (petIds.length === 0) return [];
  const { data } = await publicGallery().in("pet_id", petIds).order("created_at", { ascending: false }).limit(60);
  const seen = new Set<string>();
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => (seen.has(r.pet_id) ? false : (seen.add(r.pet_id), true)));
  return toItems(rows, viewerId);
}

// ---------------------------------------------------------------------------
// 公開前のAIチェック(犬が写っているか・住所の手がかりが写っていないか)
// ---------------------------------------------------------------------------
const CHECK_PROMPT = `あなたは犬の飼い主向けアプリ「ロカわん」の、うちの子自慢ギャラリー(誰でも見られる)に載せる写真の確認係です。
写真(複数のときは全部)を見て、次のJSONだけを返してください。
{"ok": true, "reason": null}
ok を false にするのは、次のどれかに当てはまるときだけ:
- 犬(または犬のぬいぐるみ・犬グッズではない、本物の動物のペット)がどの写真にも写っていない
- 表札・住所表示・電話番号・車のナンバープレート・郵便物の宛名など、住所や持ち主を特定できる文字がはっきり読める
- 露骨な性的表現・残虐な表現・動物虐待と思われるもの
次は理由にしない: 人が一緒に写っている、暗い・ぶれている、犬が小さい、部屋の中が写っている、服を着せている、加工やスタンプ。
ok が false のとき reason に、飼い主さんにやさしく伝える短い日本語の理由を入れる(例「表札の文字が読めるので、隠すか別の写真にしてください」)。`;

/** Geminiの障害で投稿が止まらないよう、判定できないときは通す */
export async function checkGalleryImages(images: { data: Buffer; mimeType: string }[]): Promise<{ ok: true } | { ok: false; reason: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || images.length === 0) return { ok: true };
  try {
    const res = await geminiGenerateWithFallback(
      apiKey,
      {
        contents: [{ parts: [{ text: CHECK_PROMPT }, ...images.map((im) => ({ inline_data: { mime_type: im.mimeType, data: im.data.toString("base64") } }))] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      },
      "pet gallery check",
    );
    if (!res) return { ok: true };
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: true };
    const parsed = JSON.parse(text) as { ok?: boolean; reason?: string | null };
    if (parsed.ok === false) return { ok: false, reason: (parsed.reason || "この写真はギャラリーに公開できませんでした").slice(0, 120) };
    return { ok: true };
  } catch (e) {
    console.error("[pet-gallery] check failed", e);
    return { ok: true };
  }
}
