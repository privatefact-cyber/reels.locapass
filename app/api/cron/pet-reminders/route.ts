import { NextResponse } from "next/server";
import { petAdmin } from "@/lib/pet/db";
import { notifyPetUser } from "@/lib/pet/notify";
import { daysBetween, formatJpDate, latestByType, todayJst } from "@/lib/pet/calc";
import { DOC_TYPE_SHORT, type PetDocType } from "@/lib/pet/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 毎朝(日本時間9時)、ワクチン・狂犬病の期限が近い書類を探して飼い主に知らせる(vercel.json の crons から呼ばれる)。
 * - 期限の30日前・7日前・当日(〜3日過ぎまで)の3回。同じ書類・同じ期限・同じ段階では1回だけ(locapass_pet_reminder_log)。
 * - 同じ子・同じ種類で新しい書類が登録されていたら、古い書類のお知らせは出さない。
 * - アプリ内のお知らせ+(連携済みなら)LINE+(購読端末があれば)プッシュ。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = petAdmin();
  const today = todayJst();
  const from = new Date(Date.parse(today) - 3 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(today) + 30 * 86_400_000).toISOString().slice(0, 10);

  const { data: due } = await admin
    .from("locapass_pet_documents")
    .select("pet_id")
    .in("doc_type", ["rabies", "mixed_vaccine", "other"])
    .gte("expires_on", from)
    .lte("expires_on", to)
    .limit(5000);
  const petIds = [...new Set((due ?? []).map((d) => d.pet_id as string))];
  if (petIds.length === 0) return NextResponse.json({ checked: 0, sent: 0 });

  const [{ data: docs }, { data: pets }] = await Promise.all([
    admin.from("locapass_pet_documents").select("id, pet_id, doc_type, expires_on, administered_on, created_at").in("pet_id", petIds),
    admin.from("locapass_pets").select("id, owner_id, name").in("id", petIds),
  ]);
  const petById = new Map((pets ?? []).map((p) => [p.id as string, p as { id: string; owner_id: string; name: string }]));

  type Doc = { id: string; pet_id: string; doc_type: PetDocType; expires_on: string | null; administered_on: string | null; created_at: string };
  const byPet = new Map<string, Doc[]>();
  for (const d of (docs ?? []) as Doc[]) byPet.set(d.pet_id, [...(byPet.get(d.pet_id) ?? []), d]);

  let sent = 0;
  for (const [petId, list] of byPet) {
    const pet = petById.get(petId);
    if (!pet) continue;
    for (const doc of latestByType(list).values()) {
      if (!doc.expires_on || doc.doc_type === "license") continue;
      const left = daysBetween(today, doc.expires_on);
      const stage = left <= 0 && left >= -3 ? "0d" : left > 0 && left <= 7 ? "7d" : left > 7 && left <= 30 ? "30d" : null;
      if (!stage) continue;

      // 先に記録を入れ、入った(=まだ送っていない)ときだけ送る
      const { data: logged } = await admin
        .from("locapass_pet_reminder_log")
        .upsert({ document_id: doc.id, expires_on: doc.expires_on, stage }, { onConflict: "document_id,expires_on,stage", ignoreDuplicates: true })
        .select("id");
      if (!logged?.length) continue;

      const kind = DOC_TYPE_SHORT[doc.doc_type];
      const title =
        stage === "0d"
          ? `${pet.name}ちゃんの${kind}の期限です`
          : `${pet.name}ちゃんの${kind}の時期が近づいています(あと${left}日)`;
      const body =
        doc.doc_type === "rabies"
          ? `期限: ${formatJpDate(doc.expires_on)}\n狂犬病の予防注射は年に1回(毎年4〜6月)。動物病院か市区町村の集合注射で受けられます。`
          : `期限: ${formatJpDate(doc.expires_on)}\nかかりつけの動物病院で予約しておきましょう。`;
      await notifyPetUser({ userId: pet.owner_id, type: "pet_reminder", title, body, url: `/pet/${pet.id}?tab=notebook` }).catch((e) =>
        console.error("[pet-reminders] notify failed", e),
      );
      sent++;
    }
  }
  return NextResponse.json({ checked: petIds.length, sent });
}
