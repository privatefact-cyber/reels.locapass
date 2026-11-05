"use server";

import crypto from "node:crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getPetViewer, petAdmin, PET_BUCKET } from "@/lib/pet/db";
import { notifyPetUser } from "@/lib/pet/notify";
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
  if ("error" in viewer) return { ok: false, error: viewer.error };
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
  const docType: PetDocType = ["rabies", "license", "mixed_vaccine", "other"].includes(input.docType) ? input.docType : "other";
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
    image_path: input.imagePath ? ownPath(viewer.userId, input.imagePath) : null,
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
  // 鑑札の登録番号は、プロフィールが空なら自動で入れる
  if (docType === "license" && row.registration_no) {
    await viewer.supabase.from("locapass_pets").update({ registration_no: row.registration_no }).eq("id", pet.id).is("registration_no", null);
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
  if (img) after(() => petAdmin().storage.from(PET_BUCKET).remove([img]).then(() => undefined));
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
    image_paths: ownPaths(viewer.userId, input.imagePaths),
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
  const imgs = (data[0].image_paths as string[]) ?? [];
  if (imgs.length) after(() => petAdmin().storage.from(PET_BUCKET).remove(imgs).then(() => undefined));
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 成長日誌
// ---------------------------------------------------------------------------
export type PetDiaryInput = {
  id?: string;
  petId: string;
  entryDate: string;
  weightKg?: string | number;
  body?: string;
  imagePaths?: string[];
  visibility?: PetVisibility;
};

export async function savePetDiary(input: PetDiaryInput): Promise<Result> {
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
  const row = { pet_id: pet.id, owner_id: viewer.userId, entry_date: entryDate, weight_kg: weight, body, image_paths: imagePaths, visibility: visibility(input.visibility) };
  const { data } = input.id
    ? await viewer.supabase.from("locapass_pet_diary_entries").update(row).eq("id", input.id).select("id")
    : await viewer.supabase.from("locapass_pet_diary_entries").insert(row).select("id");
  if (!data?.length) return { ok: false, error: "保存できませんでした" };

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
  refresh();
  return { ok: true };
}

export async function deletePetDiary(id: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase.from("locapass_pet_diary_entries").delete().eq("id", id).select("id, image_paths");
  if (!data?.length) return { ok: false, error: "削除できませんでした" };
  const imgs = (data[0].image_paths as string[]) ?? [];
  if (imgs.length) after(() => petAdmin().storage.from(PET_BUCKET).remove(imgs).then(() => undefined));
  refresh();
  return { ok: true };
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

  // 近く(散歩エリアが半径3km以内)で受け取りオンの人と、この子のフォロワーへ通知
  const admin = petAdmin();
  const recipients = new Set<string>();
  if (row.last_seen_lat !== null && row.last_seen_lng !== null) {
    const center = { lat: row.last_seen_lat, lng: row.last_seen_lng };
    const dLat = LOST_ALERT_RADIUS_KM / 111;
    const dLng = LOST_ALERT_RADIUS_KM / (111 * Math.cos((center.lat * Math.PI) / 180));
    const { data: near } = await admin
      .from("locapass_pet_owner_settings")
      .select("user_id, walk_lat, walk_lng")
      .eq("lost_alert_opt_in", true)
      .gte("walk_lat", center.lat - dLat)
      .lte("walk_lat", center.lat + dLat)
      .gte("walk_lng", center.lng - dLng)
      .lte("walk_lng", center.lng + dLng)
      .limit(2000);
    for (const s of near ?? []) {
      if (s.walk_lat != null && s.walk_lng != null && distanceKm(center, { lat: s.walk_lat, lng: s.walk_lng }) <= LOST_ALERT_RADIUS_KM) recipients.add(s.user_id as string);
    }
  }
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
        url: `/pet/lost?report=${reportId}`,
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
    .update({ status: outcome, resolved_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("status", "active")
    .select("pet_id");
  if (!data?.length) return { ok: false, error: "更新できませんでした" };
  await viewer.supabase.from("locapass_pets").update({ is_lost: false }).eq("id", data[0].pet_id);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 目撃情報(「ここで見た」)
// ---------------------------------------------------------------------------
export type SightingInput = { lostReportId: string; lat: number; lng: number; address?: string; photoPath?: string | null; comment?: string; seenAt?: string };

export async function postSighting(input: SightingInput): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  if (lat === null || lng === null) return { ok: false, error: "見かけた場所を地図で選んでください" };
  if (!UUID.test(input.lostReportId)) return { ok: false, error: "見つかりません" };

  const admin = petAdmin();
  const { data: report } = await admin.from("locapass_pet_lost_reports").select("id, owner_id, pet_id, status").eq("id", input.lostReportId).maybeSingle();
  if (!report || report.status !== "active") return { ok: false, error: "この迷子のお知らせは終了しています" };

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("locapass_pet_sightings").select("id", { count: "exact", head: true }).eq("reporter_id", viewer.userId).gte("created_at", since);
  if ((count ?? 0) >= 20) return { ok: false, error: "1日に送れる目撃情報の上限に達しました" };

  const photoPath = input.photoPath && ownPath(viewer.userId, input.photoPath)?.includes(`/sightings/${report.id}/`) ? input.photoPath : null;
  const seenAt = typeof input.seenAt === "string" && !Number.isNaN(Date.parse(input.seenAt)) ? new Date(input.seenAt).toISOString() : new Date().toISOString();
  const { error } = await admin.from("locapass_pet_sightings").insert({
    lost_report_id: report.id,
    reporter_id: viewer.userId,
    lat,
    lng,
    address: text(input.address, 120),
    photo_path: photoPath,
    comment: text(input.comment, 300),
    seen_at: seenAt,
  });
  if (error) return { ok: false, error: "送れませんでした" };

  if (report.owner_id !== viewer.userId) {
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
export type PetSettingsInput = { walkLat?: number | null; walkLng?: number | null; walkAreaLabel?: string; lostAlertOptIn?: boolean; lineNotify?: boolean };

export async function savePetSettings(input: PetSettingsInput): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const lat = num(input.walkLat, -90, 90);
  const lng = num(input.walkLng, -180, 180);
  // 位置は約100m単位に丸めて持つ(自宅をピンポイントで持たない)
  const round = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);
  const row: Record<string, unknown> = { user_id: viewer.userId, updated_at: new Date().toISOString() };
  if (input.walkLat !== undefined) {
    row.walk_lat = lat !== null && lng !== null ? round(lat) : null;
    row.walk_lng = lat !== null && lng !== null ? round(lng) : null;
    row.walk_area_label = text(input.walkAreaLabel, 60);
  }
  if (typeof input.lostAlertOptIn === "boolean") row.lost_alert_opt_in = input.lostAlertOptIn;
  if (typeof input.lineNotify === "boolean") row.line_notify = input.lineNotify;
  const { error } = await viewer.supabase.from("locapass_pet_owner_settings").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false, error: "保存できませんでした" };
  refresh();
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
};

export async function postFoundReport(input: FoundReportInput): Promise<Result<{ id: string; notified: number }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  if (lat === null || lng === null) return { ok: false, error: "見つけた場所を地図で選んでください" };
  const kind = input.kind === "protected" ? "protected" : "sighted";
  const species = input.species === "cat" || input.species === "other" ? input.species : "dog";
  const photoPath = input.photoPath ? ownPath(viewer.userId, input.photoPath) : null;
  if (photoPath && !photoPath.startsWith(`${viewer.userId}/found/`)) return { ok: false, error: "写真が正しくありません" };
  if (!photoPath && !text(input.features)) return { ok: false, error: "写真か、見た目の特徴を入れてください" };

  const admin = petAdmin();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("locapass_pet_found_reports").select("id", { count: "exact", head: true }).eq("reporter_id", viewer.userId).gte("created_at", since);
  if ((count ?? 0) >= 10) return { ok: false, error: "1日に送れる通報の上限に達しました" };

  const foundAt = typeof input.foundAt === "string" && !Number.isNaN(Date.parse(input.foundAt)) ? new Date(input.foundAt).toISOString() : new Date().toISOString();
  const row = {
    reporter_id: viewer.userId,
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
  const { data, error } = await viewer.supabase.from("locapass_pet_found_reports").insert(row).select("id").single();
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
  {
    const { dLat, dLng } = box(LOST_ALERT_RADIUS_KM);
    const { data: near } = await admin
      .from("locapass_pet_owner_settings")
      .select("user_id, walk_lat, walk_lng")
      .eq("lost_alert_opt_in", true)
      .gte("walk_lat", lat - dLat)
      .lte("walk_lat", lat + dLat)
      .gte("walk_lng", lng - dLng)
      .lte("walk_lng", lng + dLng)
      .limit(2000);
    for (const s of near ?? []) {
      if (!recipients.has(s.user_id as string) && s.walk_lat != null && s.walk_lng != null && distanceKm({ lat, lng }, { lat: s.walk_lat, lng: s.walk_lng }) <= LOST_ALERT_RADIUS_KM)
        recipients.set(s.user_id as string, "nearby");
    }
  }
  recipients.delete(viewer.userId);
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
  return { ok: true, id, notified: list.length };
}

export async function resolveFoundReport(id: string): Promise<Result> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  const { data } = await viewer.supabase
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
export async function claimFoundReport(id: string): Promise<Result<{ hasLostReport: boolean }>> {
  const viewer = await viewerOrError();
  if ("error" in viewer) return { ok: false, error: viewer.error };
  if (!UUID.test(id)) return { ok: false, error: "見つかりません" };
  const admin = petAdmin();
  const { data: report } = await admin.from("locapass_pet_found_reports").select("id, reporter_id, status").eq("id", id).maybeSingle();
  if (!report || report.status !== "open") return { ok: false, error: "この通報は終了しています" };
  if (report.reporter_id === viewer.userId) return { ok: false, error: "自分の通報です" };

  const { data: lost } = await admin.from("locapass_pet_lost_reports").select("id, pet_id").eq("owner_id", viewer.userId).eq("status", "active").order("created_at", { ascending: false }).limit(1);
  const myLost = lost?.[0] ?? null;

  const { error } = await admin.from("locapass_pet_found_claims").insert({ found_report_id: id, claimant_id: viewer.userId });
  if (error && error.code !== "23505") return { ok: false, error: "送れませんでした" };
  if (!error) {
    let url = `/pet/found/${id}`;
    if (myLost) url = `/pet/lost?report=${myLost.id}`;
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
  return { ok: true, hasLostReport: Boolean(myLost) };
}
