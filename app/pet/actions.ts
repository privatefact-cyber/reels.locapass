"use server";

import crypto from "node:crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getPetViewer, petAdmin, PET_BUCKET } from "@/lib/pet/db";
import { notifyPetUser } from "@/lib/pet/notify";
import { findNearbyRecipients, isBannedUser } from "@/lib/pet/recipients";
import { GUEST_LIMITS, guestIpHash, hashManageToken, newManageToken, verifyTurnstile } from "@/lib/pet/guest";
import type { PetDocType, PetSex, PetVisibility } from "@/lib/pet/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOST_ALERT_RADIUS_KM = 3;

const text = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const date = (v: unknown): string | null => (typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const visibility = (v: unknown): PetVisibility => (v === "followers" || v === "public" ? v : "private");

async function viewerOrError() {
  const viewer = await getPetViewer();
  if (!viewer) return { error: "ログインが必要です" as const };
  return viewer;
}

/** 本人の犬かどうか(RLSで本人の行しか見えないので、見つかれば本人の犬) */
async function ownsPet(supabase: Awaited<ReturnType<typeof viewerOrError>>, petId: string) {
  if ("error" in supabase || !UUID.test(petId)) return null;
  const { data } = await supabase.supabase.from("locapass_pets").select("id, name, is_lost").eq("id", petId).maybeSingle();
  return data as { id: string; name: string; is_lost: boolean } | null;
}

/** 自分がアップロードした画像のパスか(他人の画像を自分の記録に付け替えられないように) */
function ownPath(userId: string, path: unknown): string | null {
  return typeof path === "string" && path.startsWith(`${userId}/`) && !path.includes("..") && path.length < 300 ? path : null;
}
/** 端末内(IndexedDB)の画像を指す参照 "local:<uuid>"。書類・通院明細の画像はサーバーに保存せず、これだけを持つ */
const LOCAL_REF = /^local:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function localRef(v: unknown): string | null {
  return typeof v === "string" && LOCAL_REF.test(v) ? v : null;
}
function localRefs(v: unknown, max = 6): string[] {
  return Array.isArray(v) ? v.map(localRef).filter((p): p is string => p !== null).slice(0, max) : [];
}

function ownPaths(userId: string, paths: unknown, max = 6): string[] {
  return Array.isArray(paths) ? paths.map((p) => ownPath(userId, p)).filter((p): p is string => p !== null).slice(0, max) : [];
}

function refresh() {
  revalidatePath("/pet", "layout");
}

// ---------------------------------------------------------------------------
// 画像のアップロード先(非公開の置き場への期限付きアップロードURL)
// ---------------------------------------------------------------------------
export type UploadKind = "avatar" | "cover" | "document" | "medical" | "diary" | "lost" | "sighting" | "found";

export async function requestPetUpload(kind: UploadKind, targetId: string): Promise<Result<{ path: string; token: string }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) {
    // ログインなし(拾った人・見かけた人)は、「見つけました」通報と目撃情報の写真だけ送れる(IPごとに1日の上限あり)
    if (kind !== "found" && kind !== "sighting") return { ok: false, error: viewer.error };
    return guestUpload(kind, targetId);
  }
  if (kind !== "found" && !UUID.test(targetId)) return { ok: false, error: "対象が見つかりません" };

  let path: string;
  if (kind === "found") {
    // 「見つけました」通報の写真: ログイン中の人なら誰でも(投稿前なので対象IDはない)
    path = `${viewer.userId}/found/${crypto.randomUUID()}.jpg`;
  } else if (kind === "sighting") {
    // 目撃情報の写真: 迷子のお知らせが出ている間だけ、ログイン中の人なら誰でも
    const { data: report } = await petAdmin().from("locapass_pet_lost_reports").select("id, status").eq("id", targetId).maybeSingle();
    if (!report || report.status !== "active") return { ok: false, error: "この迷子のお知らせは終了しています" };
    path = `${viewer.userId}/sightings/${targetId}/${crypto.randomUUID()}.jpg`;
  } else {
    if (!(await ownsPet(viewer, targetId))) return { ok: false, error: "この子の記録は編集できません" };
    path = `${viewer.userId}/${targetId}/${kind}/${crypto.randomUUID()}.jpg`;
  }
  const { data, error } = await petAdmin().storage.from(PET_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "アップロードの準備に失敗しました" };
  return { ok: true, path, token: data.token };
}

async function guestUpload(kind: "found" | "sighting", targetId: string): Promise<Result<{ path: string; token: string }>> {
  const admin = petAdmin();
  const ip = await guestIpHash();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("locapass_pet_guest_uploads").select("id", { count: "exact", head: true }).eq("ip_hash", ip).gte("created_at", since);
  if ((count ?? 0) >= GUEST_LIMITS.upload) return { ok: false, error: "写真を送れる回数の上限に達しました。ログインするとさらに送れます" };
  let path: string;
  if (kind === "sighting") {
    if (!UUID.test(targetId)) return { ok: false, error: "対象が見つかりません" };
    const { data: report } = await admin.from("locapass_pet_lost_reports").select("id, status").eq("id", targetId).maybeSingle();
    if (!report || report.status !== "active") return { ok: false, error: "この迷子のお知らせは終了しています" };
    path = `guest/sightings/${targetId}/${crypto.randomUUID()}.jpg`;
  } else {
    path = `guest/found/${crypto.randomUUID()}.jpg`;
  }
  await admin.from("locapass_pet_guest_uploads").insert({ ip_hash: ip });
  const { data, error } = await admin.storage.from(PET_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "アップロードの準備に失敗しました" };
  return { ok: true, path, token: data.token };
}

/** ゲストが送る写真のパスか(この形以外は受け付けない) */
function guestPath(path: unknown, prefix: string): string | null {
  return typeof path === "string" && path.startsWith(prefix) && !path.includes("..") && path.length < 300 ? path : null;
}

// ---------------------------------------------------------------------------
// うちの子(プロフィール)
// ---------------------------------------------------------------------------
export type PetProfileInput = {
  name: string;
  breed?: string;
  sex?: PetSex;
  neutered?: boolean | null;
  birthday?: string;
  birthdayEstimated?: boolean;
  coatColor?: string;
  weightKg?: string | number;
  microchipNo?: string;
  registrationNo?: string;
  allergies?: string;
  conditions?: string;
  vetName?: string;
  insuranceName?: string;
  insuranceNo?: string;
  features?: string;
  visibility?: PetVisibility;
  cardPublic?: boolean;
};

function profileRow(input: PetProfileInput) {
  const name = text(input.name, 40);
  if (!name) return null;
  return {
    name,
    breed: text(input.breed, 60),
    sex: input.sex === "male" || input.sex === "female" ? input.sex : "unknown",
    neutered: typeof input.neutered === "boolean" ? input.neutered : null,
    birthday: date(input.birthday),
    birthday_estimated: Boolean(input.birthdayEstimated),
    coat_color: text(input.coatColor, 40),
    weight_kg: num(input.weightKg, 0.1, 120),
    microchip_no: text(input.microchipNo, 20),
    registration_no: text(input.registrationNo, 40),
    allergies: text(input.allergies, 300),
    conditions: text(input.conditions, 300),
    vet_name: text(input.vetName, 80),
    insurance_name: text(input.insuranceName, 60),
    insurance_no: text(input.insuranceNo, 40),
    features: text(input.features, 300),
    visibility: visibility(input.visibility),
    card_public: input.cardPublic !== false,
    updated_at: new Date().toISOString(),
  };
}

const TAG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 読み間違えやすい 0/O・1/I は使わない
function newTagCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => TAG_ALPHABET[b % TAG_ALPHABET.length]).join("");
}

export async function createPet(input: PetProfileInput): Promise<Result<{ id: string }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const row = profileRow(input);
  if (!row) return { ok: false, error: "お名前を入れてください" };

  const { count } = await viewer.supabase.from("locapass_pets").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 20) return { ok: false, error: "登録できるのは20頭までです" };

  for (let i = 0; i < 3; i++) {
    const { data, error } = await viewer.supabase
      .from("locapass_pets")
      .insert({ ...row, owner_id: viewer.userId, tag_code: newTagCode(), sort_order: count ?? 0 })
      .select("id")
      .single();
    if (data) {
      refresh();
      return { ok: true, id: data.id as string };
    }
    if (error?.code !== "23505") {
      console.error("[pet] create failed", error);
      break;
    }
  }
  return { ok: false, error: "登録に失敗しました。もう一度お試しください" };
}

export async function updatePet(petId: string, input: PetProfileInput): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const row = profileRow(input);
  if (!row) return { ok: false, error: "お名前を入れてください" };
  const { data } = await viewer.supabase.from("locapass_pets").update(row).eq("id", petId).select("id");
  if (!data?.length) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}

export async function setPetImage(petId: string, slot: "avatar" | "cover", path: string | null): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const safe = path === null ? null : ownPath(viewer.userId, path);
  if (path !== null && !safe) return { ok: false, error: "画像が正しくありません" };
  const column = slot === "avatar" ? "avatar_path" : "cover_path";
  const { data } = await viewer.supabase
    .from("locapass_pets")
    .update({ [column]: safe, updated_at: new Date().toISOString() })
    .eq("id", petId)
    .select("id");
  if (!data?.length) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}

export async function deletePet(petId: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase.from("locapass_pets").delete().eq("id", petId).select("id");
  if (!data?.length) return { ok: false, error: "削除できませんでした" };
  // 画像も片付ける(失敗しても記録の削除は成功のまま)
  after(async () => {
    const admin = petAdmin();
    const prefix = `${viewer.userId}/${petId}`;
    for (const kind of ["avatar", "cover", "document", "medical", "diary", "lost"]) {
      const { data: files } = await admin.storage.from(PET_BUCKET).list(`${prefix}/${kind}`, { limit: 1000 });
      if (files?.length) await admin.storage.from(PET_BUCKET).remove(files.map((f) => `${prefix}/${kind}/${f.name}`));
    }
  });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 手帳(書類)
// ---------------------------------------------------------------------------
export type PetDocumentInput = {
  id?: string;
  petId: string;
  docType: PetDocType;
  title?: string;
  administeredOn?: string;
  expiresOn?: string;
  clinicName?: string;
  vaccineName?: string;
  registrationNo?: string;
  note?: string;
  imagePath?: string | null;
  aiResult?: unknown;
};

export async function savePetDocument(input: PetDocumentInput): Promise<Result<{ id: string }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const pet = await ownsPet(viewer, input.petId);
  if (!pet) return { ok: false, error: "この子の手帳は編集できません" };
  const docType: PetDocType = ["rabies", "license", "mixed_vaccine", "insurance", "other"].includes(input.docType) ? input.docType : "other";
  const row = {
    pet_id: pet.id,
    owner_id: viewer.userId,
    doc_type: docType,
    title: text(input.title, 60),
    administered_on: date(input.administeredOn),
    expires_on: docType === "license" ? null : date(input.expiresOn),
    clinic_name: text(input.clinicName, 80),
    vaccine_name: text(input.vaccineName, 60),
    registration_no: text(input.registrationNo, 40),
    note: text(input.note, 500),
    // 非公開の置き場の自分の画像(または以前の端末内保存の参照)
    image_path: input.imagePath ? (ownPath(viewer.userId, input.imagePath) ?? localRef(input.imagePath)) : null,
    ...(input.aiResult !== undefined && !input.id ? { ai_result: input.aiResult } : {}),
  };
  const query = input.id
    ? viewer.supabase.from("locapass_pet_documents").update(row).eq("id", input.id).select("id")
    : viewer.supabase.from("locapass_pet_documents").insert(row).select("id");
  const { data, error } = await query;
  if (error || !data?.length) {
    console.error("[pet] save document failed", error);
    return { ok: false, error: "保存できませんでした" };
  }
  // 鑑札の登録番号・ペット保険の会社名と証券番号は、プロフィールが空なら自動で入れる
  if (docType === "license" && row.registration_no) {
    await viewer.supabase.from("locapass_pets").update({ registration_no: row.registration_no }).eq("id", pet.id).is("registration_no", null);
  }
  if (docType === "insurance") {
    if (row.clinic_name) await viewer.supabase.from("locapass_pets").update({ insurance_name: row.clinic_name }).eq("id", pet.id).is("insurance_name", null);
    if (row.registration_no) await viewer.supabase.from("locapass_pets").update({ insurance_no: row.registration_no }).eq("id", pet.id).is("insurance_no", null);
  }
  refresh();
  return { ok: true, id: data[0].id as string };
}

export async function deletePetDocument(id: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase.from("locapass_pet_documents").delete().eq("id", id).select("id, image_path");
  if (!data?.length) return { ok: false, error: "削除できませんでした" };
  const img = data[0].image_path as string | null;
  // 以前の形式(サーバー保存)の画像だけサーバーから消す。端末内の画像は画面側で消す
  if (img && !img.startsWith("local:")) after(() => petAdmin().storage.from(PET_BUCKET).remove([img]).then(() => undefined));
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 病気・通院の記録
// ---------------------------------------------------------------------------
export type PetMedicalInput = {
  id?: string;
  petId: string;
  visitedOn: string;
  hospital?: string;
  symptoms?: string;
  diagnosis?: string;
  medicines?: string;
  cost?: string | number;
  note?: string;
  imagePaths?: string[];
};

export async function savePetMedical(input: PetMedicalInput): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const pet = await ownsPet(viewer, input.petId);
  if (!pet) return { ok: false, error: "この子の記録は編集できません" };
  const visitedOn = date(input.visitedOn);
  if (!visitedOn) return { ok: false, error: "日付を入れてください" };
  const row = {
    pet_id: pet.id,
    owner_id: viewer.userId,
    visited_on: visitedOn,
    hospital: text(input.hospital, 80),
    symptoms: text(input.symptoms, 500),
    diagnosis: text(input.diagnosis, 300),
    medicines: text(input.medicines, 300),
    cost: num(input.cost, 0, 10_000_000),
    note: text(input.note, 1000),
    image_paths: [...ownPaths(viewer.userId, input.imagePaths), ...localRefs(input.imagePaths)].slice(0, 6),
  };
  const { data } = input.id
    ? await viewer.supabase.from("locapass_pet_medical_records").update(row).eq("id", input.id).select("id")
    : await viewer.supabase.from("locapass_pet_medical_records").insert(row).select("id");
  if (!data?.length) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}

export async function deletePetMedical(id: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase.from("locapass_pet_medical_records").delete().eq("id", id).select("id, image_paths");
  if (!data?.length) return { ok: false, error: "削除できませんでした" };
  const imgs = ((data[0].image_paths as string[]) ?? []).filter((p) => !p.startsWith("local:"));
  if (imgs.length) after(() => petAdmin().storage.from(PET_BUCKET).remove(imgs).then(() => undefined));
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 成長日誌(公開にすると「うちの子自慢ギャラリー」に並ぶ。場所を付けると LOCAPASS snap にも投稿)
// ---------------------------------------------------------------------------
/**
 * snapにも投稿するときの場所。施設を選んだときは、ブラウザから届いた位置ではなく施設の登録位置を使う。
 * 自由な場所(景色の良い場所など)のときは、本人が地図で決めた点をそのまま使う。
 */
export type PetSnapPlace = { lat: number; lng: number; spotName: string; address?: string | null; shopId?: string | null; placeId?: string | null };

export type PetDiaryInput = {
  id?: string;
  petId: string;
  entryDate: string;
  weightKg?: string | number;
  body?: string;
  imagePaths?: string[];
  visibility?: PetVisibility;
  snap?: PetSnapPlace | null;
};

const SNAP_RATE_LIMIT_PER_10MIN = 10;

async function loadPetImages(paths: string[]) {
  const admin = petAdmin();
  const out: { data: Buffer; mimeType: string }[] = [];
  for (const p of paths) {
    const { data } = await admin.storage.from(PET_BUCKET).download(p);
    if (data) out.push({ data: Buffer.from(await data.arrayBuffer()), mimeType: data.type || "image/jpeg" });
  }
  return out;
}

/** snapに出す場所を決める(施設なら登録位置に固定)。だめなら null */
async function resolveSnapPlace(input: PetSnapPlace) {
  const admin = petAdmin();
  if (input.shopId && UUID.test(input.shopId)) {
    const { data: shop } = await admin.from("locapass_shops").select("id, name, address, lat, lng, venue_id").eq("id", input.shopId).eq("status", "active").maybeSingle();
    if (shop && shop.lat != null && shop.lng != null)
      return { lat: shop.lat as number, lng: shop.lng as number, spotName: (shop.name as string).slice(0, 100), address: (shop.address as string | null)?.slice(0, 200) ?? null, shop: { id: shop.id as string, venueId: (shop.venue_id as string | null) ?? null } };
  }
  if (input.placeId && UUID.test(input.placeId)) {
    const { data: place } = await admin.from("locapass_pet_places").select("name, address, lat, lng").eq("id", input.placeId).eq("hidden", false).maybeSingle();
    if (place) return { lat: place.lat as number, lng: place.lng as number, spotName: (place.name as string).slice(0, 100), address: (place.address as string | null)?.slice(0, 200) ?? null, shop: null };
  }
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  const spotName = text(input.spotName, 100);
  if (lat === null || lng === null || !spotName) return null;
  return { lat, lng, spotName, address: text(input.address, 200), shop: null };
}

/** 日誌の1枚目を LOCAPASS snap(area_photo_posts)に投稿する。投稿のIDを返す */
async function postDiaryToSnap(userId: string, image: { data: Buffer; mimeType: string }, place: NonNullable<Awaited<ReturnType<typeof resolveSnapPlace>>>, comment: string | null): Promise<Result<{ postId: string }>> {
  const admin = petAdmin();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin.from("area_photo_posts").select("id", { count: "exact", head: true }).eq("member_id", userId).gte("created_at", since);
  if ((count ?? 0) >= SNAP_RATE_LIMIT_PER_10MIN) return { ok: false, error: "snapへの投稿が続いています。少し時間をおいてからお試しください" };

  const [{ moderateAndTag }, { resolveAreaAndVenue }, { translatePostFields }] = await Promise.all([
    import("@/lib/photo/moderate"),
    import("@/lib/photo/resolveArea"),
    import("@/lib/photo/translate"),
  ]);
  const moderation = await moderateAndTag(image.data, image.mimeType, place.spotName, comment ?? "");
  if (!moderation.appropriate) return { ok: false, error: moderation.rejectReason ?? "この写真はsnapに投稿できませんでした" };

  const { data: profile } = await admin.from("locapass_members").select("nickname, avatar_url").eq("id", userId).maybeSingle();
  // 写真はロカわん側で縮小・再エンコード済み(撮影位置などのExifは残っていない)
  const path = `${userId}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`;
  const { error: upErr } = await admin.storage.from("map-photos").upload(path, image.data, { contentType: "image/jpeg" });
  if (upErr) {
    console.error("[pet-snap] upload failed", upErr);
    return { ok: false, error: "snapへの投稿に失敗しました" };
  }
  const imageUrl = admin.storage.from("map-photos").getPublicUrl(path).data.publicUrl;
  const { site, venueId } = await resolveAreaAndVenue(place.lat, place.lng);
  const snapComment = comment ? comment.slice(0, 500) : null;
  const { data: inserted, error } = await admin
    .from("area_photo_posts")
    .insert({
      member_id: userId,
      user_name: (profile?.nickname as string | null) ?? "ゲスト",
      avatar_url: (profile?.avatar_url as string | null) ?? null,
      image_url: imageUrl,
      latitude: place.lat,
      longitude: place.lng,
      address: place.address,
      spot_name: place.spotName,
      comment: snapComment,
      tags: moderation.tags,
      site,
      venue_id: place.shop?.venueId ?? venueId,
      place_kind: place.shop?.venueId ? "listed" : "free",
      place_id: null,
      place_name: place.shop ? place.spotName : null,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[pet-snap] insert failed", error);
    await admin.storage.from("map-photos").remove([path]);
    return { ok: false, error: "snapへの投稿に失敗しました" };
  }
  // LOCAPASSのお店を選んだときは、お店のページの写真一覧にも出るように紐づける
  if (place.shop) {
    const { error: linkErr } = await admin
      .from("locapass_shop_photo_links")
      .upsert({ post_id: inserted.id, shop_id: place.shop.id, mode: "attach", created_by: userId }, { onConflict: "post_id,shop_id" });
    if (linkErr) console.error("[pet-snap] shop link failed", linkErr);
  }
  after(async () => {
    const translations = await translatePostFields({ spot_name: place.spotName, comment: snapComment, address: place.address });
    if (translations) await admin.from("area_photo_posts").update({ translations }).eq("id", inserted.id);
  });
  return { ok: true, postId: inserted.id as string };
}

export async function savePetDiary(input: PetDiaryInput): Promise<Result<{ snapPostId?: string | null }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const pet = await ownsPet(viewer, input.petId);
  if (!pet) return { ok: false, error: "この子の日誌は編集できません" };
  const entryDate = date(input.entryDate);
  if (!entryDate) return { ok: false, error: "日付を入れてください" };
  const weight = num(input.weightKg, 0.1, 120);
  const body = text(input.body, 1000);
  const imagePaths = ownPaths(viewer.userId, input.imagePaths, 4);
  if (weight === null && !body && imagePaths.length === 0) return { ok: false, error: "写真・体重・ひとことのどれかを入れてください" };
  const vis = visibility(input.visibility);
  const wantsSnap = !input.id && Boolean(input.snap);
  if (wantsSnap && (vis !== "public" || imagePaths.length === 0)) return { ok: false, error: "snapに投稿するには、写真を付けて「公開」にしてください" };

  // 公開(ギャラリーに並ぶ)ときは、AIで「犬が写っているか・住所の手がかりが写っていないか」を確かめる
  let images: { data: Buffer; mimeType: string }[] = [];
  if (vis === "public" && imagePaths.length > 0) {
    images = await loadPetImages(imagePaths);
    const { checkGalleryImages } = await import("@/lib/pet/gallery");
    const check = await checkGalleryImages(images);
    if (!check.ok) return { ok: false, error: `${check.reason}(「自分だけ」「フォロワー」なら、このまま保存できます)` };
  }
  const snapPlace = wantsSnap ? await resolveSnapPlace(input.snap!) : null;
  if (wantsSnap && !snapPlace) return { ok: false, error: "snapに出す場所と、場所の名前を入れてください" };

  const row = { pet_id: pet.id, owner_id: viewer.userId, entry_date: entryDate, weight_kg: weight, body, image_paths: imagePaths, visibility: vis };
  const { data } = input.id
    ? await viewer.supabase.from("locapass_pet_diary_entries").update(row).eq("id", input.id).select("id")
    : await viewer.supabase.from("locapass_pet_diary_entries").insert(row).select("id");
  if (!data?.length) return { ok: false, error: "保存できませんでした" };
  const entryId = data[0].id as string;

  // 一番新しい体重をプロフィールにも反映
  if (weight !== null) {
    const { data: latest } = await viewer.supabase
      .from("locapass_pet_diary_entries")
      .select("weight_kg")
      .eq("pet_id", pet.id)
      .not("weight_kg", "is", null)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    const w = latest?.[0]?.weight_kg;
    if (w != null) await viewer.supabase.from("locapass_pets").update({ weight_kg: w }).eq("id", pet.id);
  }

  // snapへ(失敗しても日誌は保存済み。理由を返して知らせる)
  let snapPostId: string | null = null;
  if (snapPlace && images[0]) {
    const posted = await postDiaryToSnap(viewer.userId, images[0], snapPlace, body);
    if (!posted.ok) {
      refresh();
      return { ok: false, error: `日誌は保存しました。${posted.error}` };
    }
    snapPostId = posted.postId;
    const { data: linked } = await petAdmin().from("locapass_pet_diary_entries").update({ snap_post_id: snapPostId }).eq("id", entryId).select("id");
    if (!linked?.length) console.error("[pet-snap] diary link failed", entryId);
  }
  refresh();
  return { ok: true, snapPostId };
}

export async function deletePetDiary(id: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase.from("locapass_pet_diary_entries").delete().eq("id", id).select("id, image_paths, snap_post_id");
  if (!data?.length) return { ok: false, error: "削除できませんでした" };
  const imgs = (data[0].image_paths as string[]) ?? [];
  const snapId = data[0].snap_post_id as string | null;
  after(async () => {
    const admin = petAdmin();
    if (imgs.length) await admin.storage.from(PET_BUCKET).remove(imgs);
    // いっしょに投稿したsnapも消す(本人の投稿だけ)
    if (snapId) {
      const { data: gone } = await admin.from("area_photo_posts").delete().eq("id", snapId).eq("member_id", viewer.userId).select("image_url");
      const url = gone?.[0]?.image_url as string | undefined;
      const marker = "/map-photos/";
      if (url?.includes(marker)) await admin.storage.from("map-photos").remove([url.slice(url.indexOf(marker) + marker.length)]);
    }
  });
  refresh();
  return { ok: true };
}

/** 肉球(いいね)を押す/取り消す */
export async function togglePetDiaryLike(entryId: string): Promise<Result<{ liked: boolean; count: number }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  if (!UUID.test(entryId)) return { ok: false, error: "見つかりません" };
  const admin = petAdmin();
  const { data: entry } = await admin.from("locapass_pet_diary_entries").select("id, visibility, hidden_at").eq("id", entryId).maybeSingle();
  if (!entry || entry.visibility !== "public" || entry.hidden_at) return { ok: false, error: "この投稿は見られなくなりました" };
  const { data: removed } = await admin.from("locapass_pet_diary_likes").delete().eq("entry_id", entryId).eq("user_id", viewer.userId).select("entry_id");
  let liked = false;
  if (!removed?.length) {
    const { error } = await admin.from("locapass_pet_diary_likes").insert({ entry_id: entryId, user_id: viewer.userId });
    if (error && error.code !== "23505") return { ok: false, error: "押せませんでした" };
    liked = true;
  }
  const { data: after_ } = await admin.from("locapass_pet_diary_entries").select("like_count").eq("id", entryId).maybeSingle();
  revalidatePath("/pet/gallery", "layout");
  return { ok: true, liked, count: (after_?.like_count as number | undefined) ?? 0 };
}

// ---------------------------------------------------------------------------
// 犬用フォロー(人→犬、飼い主の承認制)
// ---------------------------------------------------------------------------
export async function requestPetFollow(petId: string): Promise<Result<{ status: "pending" | "approved" }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  if (!UUID.test(petId)) return { ok: false, error: "見つかりません" };
  const admin = petAdmin();
  const { data: pet } = await admin.from("locapass_pets").select("id, owner_id, name, card_public").eq("id", petId).maybeSingle();
  if (!pet || !pet.card_public) return { ok: false, error: "この子は見つかりませんでした" };
  if (pet.owner_id === viewer.userId) return { ok: false, error: "自分の子はフォローできません" };

  const { data: existing } = await admin.from("locapass_pet_follows").select("status").eq("pet_id", petId).eq("follower_id", viewer.userId).maybeSingle();
  if (existing) return { ok: true, status: existing.status as "pending" | "approved" };

  const { error } = await admin.from("locapass_pet_follows").insert({ pet_id: petId, follower_id: viewer.userId, status: "pending" });
  if (error) return { ok: false, error: "フォローできませんでした" };

  after(async () => {
    const { data: me } = await admin.from("locapass_members").select("nickname").eq("id", viewer.userId).maybeSingle();
    await notifyPetUser({
      userId: pet.owner_id as string,
      type: "pet_follow_request",
      title: `${me?.nickname || "ゲスト"}さんが${pet.name}ちゃんをフォローしたいそうです`,
      body: "承認するとフォローされます",
      url: "/pet/follows",
    }).catch((e) => console.error("[pet] follow notify failed", e));
  });
  refresh();
  return { ok: true, status: "pending" };
}

export async function cancelPetFollow(petId: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  await petAdmin().from("locapass_pet_follows").delete().eq("pet_id", petId).eq("follower_id", viewer.userId);
  refresh();
  return { ok: true };
}

/** 飼い主が、フォロー申請を承認/お断り(フォロワーの解除も「お断り」と同じ) */
export async function respondPetFollow(followId: string, approve: boolean): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  if (!UUID.test(followId)) return { ok: false, error: "見つかりません" };
  const admin = petAdmin();
  const { data: follow } = await admin.from("locapass_pet_follows").select("id, pet_id, follower_id, status").eq("id", followId).maybeSingle();
  if (!follow) return { ok: false, error: "見つかりません" };
  const pet = await ownsPet(viewer, follow.pet_id as string);
  if (!pet) return { ok: false, error: "この子の飼い主だけが操作できます" };

  if (!approve) {
    await admin.from("locapass_pet_follows").delete().eq("id", followId);
  } else {
    const { data } = await admin.from("locapass_pet_follows").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", followId).select("id");
    if (!data?.length) return { ok: false, error: "承認できませんでした" };
    if (follow.status !== "approved") {
      const { data: p } = await admin.from("locapass_pets").select("tag_code").eq("id", pet.id).maybeSingle();
      after(() =>
        notifyPetUser({
          userId: follow.follower_id as string,
          type: "pet_follow_approved",
          title: `${pet.name}ちゃんのフォローが承認されました`,
          body: null,
          url: `/pet/t/${p?.tag_code ?? ""}`,
        }).catch((e) => console.error("[pet] approve notify failed", e)),
      );
    }
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 迷子のお知らせ
// ---------------------------------------------------------------------------
export type LostReportInput = {
  petId: string;
  lastSeenAt?: string;
  lat?: number | null;
  lng?: number | null;
  address?: string;
  features?: string;
  photoPath?: string | null;
  contactPhone?: string;
  contactLine?: string;
  contactNote?: string;
};

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function lostRow(userId: string, input: LostReportInput) {
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  const seen = typeof input.lastSeenAt === "string" && !Number.isNaN(Date.parse(input.lastSeenAt)) ? new Date(input.lastSeenAt).toISOString() : new Date().toISOString();
  return {
    last_seen_at: seen,
    last_seen_lat: lat !== null && lng !== null ? lat : null,
    last_seen_lng: lat !== null && lng !== null ? lng : null,
    last_seen_address: text(input.address, 120),
    features: text(input.features, 500),
    photo_path: input.photoPath ? ownPath(userId, input.photoPath) : null,
    contact_phone: text(input.contactPhone, 20),
    contact_line: text(input.contactLine, 60),
    contact_note: text(input.contactNote, 300),
  };
}

export async function startLostReport(input: LostReportInput): Promise<Result<{ id: string; alerted: number }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const pet = await ownsPet(viewer, input.petId);
  if (!pet) return { ok: false, error: "この子の飼い主だけが出せます" };
  if (await isBannedUser(petAdmin(), viewer.userId)) return { ok: false, error: "このアカウントでは投稿できません" };
  const row = lostRow(viewer.userId, input);
  if (!row.contact_phone && !row.contact_line && !row.contact_note) return { ok: false, error: "見つけた人が連絡できる方法を1つ以上入れてください" };

  const { data: existing } = await viewer.supabase.from("locapass_pet_lost_reports").select("id").eq("pet_id", pet.id).eq("status", "active").maybeSingle();
  if (existing) return { ok: false, error: "すでに迷子のお知らせが出ています" };

  const { data, error } = await viewer.supabase
    .from("locapass_pet_lost_reports")
    .insert({ ...row, pet_id: pet.id, owner_id: viewer.userId, status: "active" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "お知らせを出せませんでした" };
  await viewer.supabase.from("locapass_pets").update({ is_lost: true }).eq("id", pet.id);

  // 近く(散歩エリア3か所のどれか・または48時間以内にいた場所が半径3km以内)の人と、この子のフォロワーへ通知
  const admin = petAdmin();
  const recipients =
    row.last_seen_lat !== null && row.last_seen_lng !== null
      ? await findNearbyRecipients(admin, { lat: row.last_seen_lat, lng: row.last_seen_lng }, LOST_ALERT_RADIUS_KM)
      : new Set<string>();
  const { data: followers } = await admin.from("locapass_pet_follows").select("follower_id").eq("pet_id", pet.id).eq("status", "approved");
  for (const f of followers ?? []) recipients.add(f.follower_id as string);
  recipients.delete(viewer.userId);

  const reportId = data.id as string;
  const list = [...recipients].slice(0, 1000);
  await admin.from("locapass_pet_lost_reports").update({ alert_sent_count: list.length }).eq("id", reportId);
  after(async () => {
    for (const userId of list) {
      await notifyPetUser({
        userId,
        type: "pet_lost_alert",
        title: `迷子のワンコ:${pet.name}ちゃんを探しています`,
        body: [row.last_seen_address ? `最後に見た場所: ${row.last_seen_address}` : null, row.features].filter(Boolean).join("\n") || null,
        url: `/pet/lost/${reportId}`,
      }).catch((e) => console.error("[pet] lost alert failed", e));
    }
  });
  refresh();
  return { ok: true, id: reportId, alerted: list.length };
}

export async function updateLostReport(reportId: string, input: LostReportInput): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const row = lostRow(viewer.userId, input);
  if (!row.contact_phone && !row.contact_line && !row.contact_note) return { ok: false, error: "見つけた人が連絡できる方法を1つ以上入れてください" };
  const { data } = await viewer.supabase.from("locapass_pet_lost_reports").update(row).eq("id", reportId).eq("status", "active").select("id");
  if (!data?.length) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}

export async function resolveLostReport(reportId: string, outcome: "found" | "closed"): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase
    .from("locapass_pet_lost_reports")
    // 終わったら、公開していた連絡先はDBからも消す(個人情報を残さない)
    .update({ status: outcome, resolved_at: new Date().toISOString(), contact_phone: null, contact_line: null, contact_note: null })
    .eq("id", reportId)
    .eq("status", "active")
    .select("pet_id");
  if (!data?.length) return { ok: false, error: "更新できませんでした" };
  await viewer.supabase.from("locapass_pets").update({ is_lost: false }).eq("id", data[0].pet_id);
  refresh();
  return { ok: true };
}

/** 30日たったときの「まだ探していますか?」に「探しています」と答える(期限を延ばす) */
export async function confirmLostReport(reportId: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase
    .from("locapass_pet_lost_reports")
    .update({ last_confirmed_at: new Date().toISOString(), check_sent_at: null })
    .eq("id", reportId)
    .eq("status", "active")
    .select("id");
  if (!data?.length) return { ok: false, error: "更新できませんでした" };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 目撃情報(「ここで見た」)
// ---------------------------------------------------------------------------
export type SightingInput = {
  lostReportId: string;
  lat: number;
  lng: number;
  address?: string;
  photoPath?: string | null;
  comment?: string;
  seenAt?: string;
  /** ログインなしのとき: 人間チェックのトークンと、おとり欄(人には見えない。入っていたら機械とみなす) */
  turnstileToken?: string | null;
  honeypot?: string;
};

export async function postSighting(input: SightingInput): Promise<Result> {
  const viewer = await getPetViewer();
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  if (lat === null || lng === null) return { ok: false, error: "見かけた場所を地図で選んでください" };
  if (!UUID.test(input.lostReportId)) return { ok: false, error: "見つかりません" };
  if (input.honeypot) return { ok: true }; // 機械の送信は黙って捨てる

  const admin = petAdmin();
  if (viewer && (await isBannedUser(admin, viewer.userId))) return { ok: false, error: "このアカウントでは投稿できません" };
  const { data: report } = await admin.from("locapass_pet_lost_reports").select("id, owner_id, pet_id, status, hidden_at").eq("id", input.lostReportId).maybeSingle();
  if (!report || report.status !== "active" || report.hidden_at) return { ok: false, error: "この迷子のお知らせは終了しています" };

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  let ip: string | null = null;
  let photoPath: string | null = null;
  if (viewer) {
    const { count } = await admin.from("locapass_pet_sightings").select("id", { count: "exact", head: true }).eq("reporter_id", viewer.userId).gte("created_at", since);
    if ((count ?? 0) >= 20) return { ok: false, error: "1日に送れる目撃情報の上限に達しました" };
    photoPath = input.photoPath && ownPath(viewer.userId, input.photoPath)?.includes(`/sightings/${report.id}/`) ? input.photoPath : null;
  } else {
    if (!(await verifyTurnstile(input.turnstileToken))) return { ok: false, error: "確認に失敗しました。もう一度お試しください" };
    ip = await guestIpHash();
    const { count } = await admin.from("locapass_pet_sightings").select("id", { count: "exact", head: true }).eq("guest_ip_hash", ip).gte("created_at", since);
    if ((count ?? 0) >= GUEST_LIMITS.sighting) return { ok: false, error: "送れる回数の上限に達しました。ログインするとさらに送れます" };
    photoPath = guestPath(input.photoPath, `guest/sightings/${report.id}/`);
  }
  const seenAt = typeof input.seenAt === "string" && !Number.isNaN(Date.parse(input.seenAt)) ? new Date(input.seenAt).toISOString() : new Date().toISOString();
  const { error } = await admin.from("locapass_pet_sightings").insert({
    lost_report_id: report.id,
    reporter_id: viewer?.userId ?? null,
    guest_ip_hash: ip,
    lat,
    lng,
    address: text(input.address, 120),
    photo_path: photoPath,
    comment: text(input.comment, 300),
    seen_at: seenAt,
  });
  if (error) return { ok: false, error: "送れませんでした" };

  if (report.owner_id !== viewer?.userId) {
    const { data: pet } = await admin.from("locapass_pets").select("name").eq("id", report.pet_id).maybeSingle();
    after(() =>
      notifyPetUser({
        userId: report.owner_id as string,
        type: "pet_sighting",
        title: `${pet?.name ?? "ワンコ"}ちゃんの目撃情報が届きました`,
        body: [text(input.address, 120), text(input.comment, 300)].filter(Boolean).join("\n") || null,
        url: `/pet/${report.pet_id}/lost`,
      }).catch((e) => console.error("[pet] sighting notify failed", e)),
    );
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 設定(散歩エリア・迷子アラート・LINE)
// ---------------------------------------------------------------------------
export type PetSettingsInput = { lostAlertOptIn?: boolean; lineNotify?: boolean; hereAlertOptIn?: boolean };

export async function savePetSettings(input: PetSettingsInput): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const row: Record<string, unknown> = { user_id: viewer.userId, updated_at: new Date().toISOString() };
  if (typeof input.lostAlertOptIn === "boolean") row.lost_alert_opt_in = input.lostAlertOptIn;
  if (typeof input.lineNotify === "boolean") row.line_notify = input.lineNotify;
  if (typeof input.hereAlertOptIn === "boolean") {
    row.here_alert_opt_in = input.hereAlertOptIn;
    // オフにしたら、覚えていた場所もすぐ消す
    if (!input.hereAlertOptIn) Object.assign(row, { here_lat: null, here_lng: null, here_at: null });
  }
  const { error } = await viewer.supabase.from("locapass_pet_owner_settings").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}

// 位置は約100m単位に丸めて持つ(自宅や居場所をピンポイントで持たない)
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const MAX_WALK_AREAS = 3;

export async function addWalkArea(input: { lat: number; lng: number; label?: string }): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  if (lat === null || lng === null) return { ok: false, error: "地図で場所を選んでください" };
  const { count } = await viewer.supabase.from("locapass_pet_walk_areas").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_WALK_AREAS) return { ok: false, error: `散歩エリアは${MAX_WALK_AREAS}か所までです。どれかを消してから追加してください` };
  const { error } = await viewer.supabase.from("locapass_pet_walk_areas").insert({ user_id: viewer.userId, lat: round3(lat), lng: round3(lng), label: text(input.label, 60) });
  if (error) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}

export async function removeWalkArea(id: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase.from("locapass_pet_walk_areas").delete().eq("id", id).select("id");
  if (!data?.length) return { ok: false, error: "削除できませんでした" };
  refresh();
  return { ok: true };
}

/** 「いまいる場所でも受け取る」がオンの人の現在地を覚える(48時間で消える。オフの人は何もしない) */
export async function updateHereLocation(input: { lat: number; lng: number }): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  if (lat === null || lng === null) return { ok: false, error: "位置が正しくありません" };
  const { data } = await viewer.supabase
    .from("locapass_pet_owner_settings")
    .update({ here_lat: round3(lat), here_lng: round3(lng), here_at: new Date().toISOString() })
    .eq("user_id", viewer.userId)
    .eq("here_alert_opt_in", true)
    .select("user_id");
  if (!data?.length) return { ok: false, error: "受け取りがオフです" };
  return { ok: true };
}

export async function unlinkPetLine(): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase
    .from("locapass_pet_owner_settings")
    .update({ line_user_id: null, line_linked_at: null, updated_at: new Date().toISOString() })
    .eq("user_id", viewer.userId)
    .select("user_id");
  if (!data?.length) return { ok: false, error: "解除できませんでした" };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 「迷子のペットを見つけました!」の通報(保護している/見かけた)
// ---------------------------------------------------------------------------
const FOUND_NOTIFY_LOST_KM = 5; // この距離以内で迷子のお知らせを出している飼い主に知らせる
const SPECIES_LABEL = { dog: "ワンコ", cat: "ネコ", other: "ペット" } as const;

export type FoundReportInput = {
  kind: "protected" | "sighted";
  species: "dog" | "cat" | "other";
  lat: number;
  lng: number;
  address?: string;
  foundAt?: string;
  features?: string;
  handedTo?: string;
  contactNote?: string;
  photoPath?: string | null;
  /** ログインなしのとき: 人間チェックのトークンと、おとり欄 */
  turnstileToken?: string | null;
  honeypot?: string;
};

export async function postFoundReport(input: FoundReportInput): Promise<Result<{ id: string; notified: number; manageToken: string | null }>> {
  const viewer = await getPetViewer();
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  if (lat === null || lng === null) return { ok: false, error: "見つけた場所を地図で選んでください" };
  if (input.honeypot) return { ok: false, error: "送れませんでした" };
  const kind = input.kind === "protected" ? "protected" : "sighted";
  const species = input.species === "cat" || input.species === "other" ? input.species : "dog";

  const admin = petAdmin();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  let photoPath: string | null = null;
  let ip: string | null = null;
  let manage: { token: string; hash: string } | null = null;
  if (viewer) {
    photoPath = input.photoPath ? ownPath(viewer.userId, input.photoPath) : null;
    if (photoPath && !photoPath.startsWith(`${viewer.userId}/found/`)) return { ok: false, error: "写真が正しくありません" };
    if (await isBannedUser(admin, viewer.userId)) return { ok: false, error: "このアカウントでは投稿できません" };
    const { count } = await admin.from("locapass_pet_found_reports").select("id", { count: "exact", head: true }).eq("reporter_id", viewer.userId).gte("created_at", since);
    if ((count ?? 0) >= 10) return { ok: false, error: "1日に送れる通報の上限に達しました" };
  } else {
    // ログインなし: 人間チェック+IPごとの回数制限。あとで解決・削除するための管理用リンクを渡す
    if (!(await verifyTurnstile(input.turnstileToken))) return { ok: false, error: "確認に失敗しました。もう一度お試しください" };
    ip = await guestIpHash();
    const { count } = await admin.from("locapass_pet_found_reports").select("id", { count: "exact", head: true }).eq("guest_ip_hash", ip).gte("created_at", since);
    if ((count ?? 0) >= GUEST_LIMITS.found) return { ok: false, error: "送れる回数の上限に達しました。ログインするとさらに送れます" };
    photoPath = guestPath(input.photoPath, "guest/found/");
    manage = newManageToken();
  }
  if (!photoPath && !text(input.features)) return { ok: false, error: "写真か、見た目の特徴を入れてください" };

  const foundAt = typeof input.foundAt === "string" && !Number.isNaN(Date.parse(input.foundAt)) ? new Date(input.foundAt).toISOString() : new Date().toISOString();
  const row = {
    reporter_id: viewer?.userId ?? null,
    guest_ip_hash: ip,
    manage_token_hash: manage?.hash ?? null,
    kind,
    species,
    photo_path: photoPath,
    lat,
    lng,
    address: text(input.address, 120),
    found_at: foundAt,
    features: text(input.features, 500),
    handed_to: text(input.handedTo, 120),
    contact_note: text(input.contactNote, 200),
  };
  const { data, error } = await admin.from("locapass_pet_found_reports").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: "通報できませんでした" };
  const id = data.id as string;

  // 知らせる相手: ①近く(5km)で迷子のお知らせを出している飼い主 ②散歩エリアが半径3km以内で受け取りオンの人
  const recipients = new Map<string, "lost_owner" | "nearby">();
  const box = (km: number) => ({ dLat: km / 111, dLng: km / (111 * Math.cos((lat * Math.PI) / 180)) });
  {
    const { dLat, dLng } = box(FOUND_NOTIFY_LOST_KM);
    const { data: lost } = await admin
      .from("locapass_pet_lost_reports")
      .select("owner_id, last_seen_lat, last_seen_lng")
      .eq("status", "active")
      .is("hidden_at", null)
      .gte("last_seen_lat", lat - dLat)
      .lte("last_seen_lat", lat + dLat)
      .gte("last_seen_lng", lng - dLng)
      .lte("last_seen_lng", lng + dLng)
      .limit(500);
    for (const l of lost ?? []) {
      if (l.last_seen_lat != null && l.last_seen_lng != null && distanceKm({ lat, lng }, { lat: l.last_seen_lat, lng: l.last_seen_lng }) <= FOUND_NOTIFY_LOST_KM)
        recipients.set(l.owner_id as string, "lost_owner");
    }
  }
  for (const userId of await findNearbyRecipients(admin, { lat, lng }, LOST_ALERT_RADIUS_KM)) {
    if (!recipients.has(userId)) recipients.set(userId, "nearby");
  }
  if (viewer) recipients.delete(viewer.userId);
  const list = [...recipients].slice(0, 1000);
  const what = `${SPECIES_LABEL[species]}を${kind === "protected" ? "保護しています" : "見かけました"}`;
  after(async () => {
    for (const [userId, why] of list) {
      await notifyPetUser({
        userId,
        type: "pet_found",
        title: why === "lost_owner" ? `近くで迷子の${what}。うちの子かもしれません` : `近くで迷子の${what}`,
        body: [row.address, row.features].filter(Boolean).join("\n") || null,
        url: `/pet/found/${id}`,
      }).catch((e) => console.error("[pet] found notify failed", e));
    }
  });
  refresh();
  return { ok: true, id, notified: list.length, manageToken: manage?.token ?? null };
}

/** 通報を操作できるか: 通報したログイン会員本人、またはゲスト通報の管理用リンクを持っている人 */
async function canManageFound(id: string, manageToken?: string | null): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const { data } = await petAdmin().from("locapass_pet_found_reports").select("reporter_id, manage_token_hash").eq("id", id).maybeSingle();
  if (!data) return false;
  const viewer = await getPetViewer();
  if (viewer && data.reporter_id === viewer.userId) return true;
  return Boolean(manageToken && data.manage_token_hash && hashManageToken(manageToken) === data.manage_token_hash);
}

export async function resolveFoundReport(id: string, manageToken?: string | null): Promise<Result> {
  if (!(await canManageFound(id, manageToken))) return { ok: false, error: "この通報を操作できるのは、通報した人だけです" };
  const { data } = await petAdmin()
    .from("locapass_pet_found_reports")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open")
    .select("id");
  if (!data?.length) return { ok: false, error: "更新できませんでした" };
  refresh();
  return { ok: true };
}

/** 「うちの子かも!」: 通報した人に知らせる(連絡先は、飼い主の迷子のお知らせに出ているものを見てもらう) */
export async function claimFoundReport(id: string): Promise<Result<{ hasLostReport: boolean; guestReporter?: boolean }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  if (!UUID.test(id)) return { ok: false, error: "見つかりません" };
  const admin = petAdmin();
  const { data: report } = await admin.from("locapass_pet_found_reports").select("id, reporter_id, status, hidden_at").eq("id", id).maybeSingle();
  if (!report || report.status !== "open" || report.hidden_at) return { ok: false, error: "この通報は終了しています" };
  if (report.reporter_id === viewer.userId) return { ok: false, error: "自分の通報です" };
  if (!report.reporter_id) return { ok: true, hasLostReport: false, guestReporter: true };

  const { data: lost } = await admin.from("locapass_pet_lost_reports").select("id, pet_id").eq("owner_id", viewer.userId).eq("status", "active").order("created_at", { ascending: false }).limit(1);
  const myLost = lost?.[0] ?? null;

  const { error } = await admin.from("locapass_pet_found_claims").insert({ found_report_id: id, claimant_id: viewer.userId });
  if (error && error.code !== "23505") return { ok: false, error: "送れませんでした" };
  if (!error) {
    let url = `/pet/found/${id}`;
    if (myLost) url = `/pet/lost/${myLost.id}`;
    const { data: me } = await admin.from("locapass_members").select("nickname").eq("id", viewer.userId).maybeSingle();
    after(() =>
      notifyPetUser({
        userId: report.reporter_id as string,
        type: "pet_found_claim",
        title: `${me?.nickname || "ゲスト"}さんが「うちの子かも」と言っています`,
        body: myLost ? "迷子のお知らせに飼い主さんの連絡先が出ています" : "通報のページを確認してください",
        url,
      }).catch((e) => console.error("[pet] claim notify failed", e)),
    );
  }
  return { ok: true, hasLostReport: Boolean(myLost), guestReporter: false };
}

/** 通報した人が、自分の通報を写真ごと削除する(間違えて送ったときなど)。ゲストは管理用リンクで */
export async function deleteFoundReport(id: string, manageToken?: string | null): Promise<Result> {
  if (!(await canManageFound(id, manageToken))) return { ok: false, error: "この通報を削除できるのは、通報した人だけです" };
  const { data } = await petAdmin().from("locapass_pet_found_reports").delete().eq("id", id).select("id, photo_path");
  if (!data?.length) return { ok: false, error: "削除できませんでした" };
  const photo = data[0].photo_path as string | null;
  if (photo) after(() => petAdmin().storage.from(PET_BUCKET).remove([photo]).then(() => undefined));
  refresh();
  return { ok: true };
}

/** 不適切の報告(迷子のお知らせ・見つけました通報)。運営が管理画面で確認する */
export async function flagPetReport(targetType: "lost" | "found" | "diary", targetId: string, reason: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  if (!UUID.test(targetId) || (targetType !== "lost" && targetType !== "found" && targetType !== "diary")) return { ok: false, error: "見つかりません" };
  const { error } = await petAdmin().from("locapass_pet_flags").insert({ target_type: targetType, target_id: targetId, reporter_id: viewer.userId, reason: text(reason, 300) });
  if (error && error.code !== "23505") return { ok: false, error: "送れませんでした" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 連絡先の表示(検索に出すページでは、連絡先をHTMLに載せず、ボタンを押したときだけ返す)
// ---------------------------------------------------------------------------
export type RevealedContact = { phone: string | null; line: string | null; note: string | null; features: string | null; handedTo: string | null };

export async function revealLostContact(reportId: string): Promise<Result<{ contact: RevealedContact }>> {
  if (!UUID.test(reportId)) return { ok: false, error: "見つかりません" };
  const { data } = await petAdmin()
    .from("locapass_pet_lost_reports")
    .select("contact_phone, contact_line, contact_note, features, status, hidden_at")
    .eq("id", reportId)
    .maybeSingle();
  if (!data || data.status !== "active" || data.hidden_at) return { ok: false, error: "このお知らせは終了しています" };
  return { ok: true, contact: { phone: data.contact_phone, line: data.contact_line, note: data.contact_note, features: data.features, handedTo: null } };
}

export async function revealFoundContact(id: string): Promise<Result<{ contact: RevealedContact }>> {
  if (!UUID.test(id)) return { ok: false, error: "見つかりません" };
  const { data } = await petAdmin()
    .from("locapass_pet_found_reports")
    .select("contact_note, features, handed_to, status, hidden_at")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.status !== "open" || data.hidden_at) return { ok: false, error: "この通報は終了しています" };
  return { ok: true, contact: { phone: null, line: null, note: data.contact_note, features: data.features, handedTo: data.handed_to } };
}

/**
 * 以前「端末内だけ」に保存した書類・明細の画像を、非公開の置き場へ移したあとで、記録の参照を差し替える。
 * (2026-11-07 方針変更: 機種変更・別端末でも見られるよう、非公開の置き場に保存する)
 */
export async function migrateLocalImageRef(input: { kind: "document" | "medical"; recordId: string; oldRef: string; newPath: string }): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const oldRef = localRef(input.oldRef);
  const newPath = ownPath(viewer.userId, input.newPath);
  if (!oldRef || !newPath || !UUID.test(input.recordId)) return { ok: false, error: "対象が正しくありません" };
  if (input.kind === "document") {
    const { data } = await viewer.supabase.from("locapass_pet_documents").update({ image_path: newPath }).eq("id", input.recordId).eq("image_path", oldRef).select("id");
    if (!data?.length) return { ok: false, error: "更新できませんでした" };
  } else {
    const { data: row } = await viewer.supabase.from("locapass_pet_medical_records").select("image_paths").eq("id", input.recordId).maybeSingle();
    const paths = ((row?.image_paths as string[] | undefined) ?? []).map((p) => (p === oldRef ? newPath : p));
    const { data } = await viewer.supabase.from("locapass_pet_medical_records").update({ image_paths: paths }).eq("id", input.recordId).select("id");
    if (!data?.length) return { ok: false, error: "更新できませんでした" };
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// ログイン・登録画面: このメールアドレスがLOCAPASSに登録済みかの確認(ロカわんはLOCAPASSと同じアカウント)
// ---------------------------------------------------------------------------
const EMAIL_CHECKS_PER_HOUR = 10;

export async function checkEmailRegistered(email: string): Promise<Result<{ registered: boolean }>> {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) return { ok: false, error: "メールアドレスを正しく入れてください" };
  const admin = petAdmin();
  // 他人のメールアドレスを総当たりで調べられないよう、送信元ごとに1時間の上限をかける
  const ip = await guestIpHash();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("locapass_pet_email_checks").select("id", { count: "exact", head: true }).eq("ip_hash", ip).gte("created_at", since);
  if ((count ?? 0) >= EMAIL_CHECKS_PER_HOUR) return { ok: false, error: "しばらく時間をおいてからお試しください" };
  await admin.from("locapass_pet_email_checks").insert({ ip_hash: ip });
  const { data: userId } = await admin.rpc("locapass_get_user_id_by_email", { p_email: e });
  return { ok: true, registered: Boolean(userId) };
}
