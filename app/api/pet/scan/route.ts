import { NextResponse } from "next/server";
import { geminiGenerateWithFallback } from "@/lib/gemini";
import { getPetViewer, petAdmin } from "@/lib/pet/db";
import { PET_SCAN_PROMPT, normalizePetScan } from "@/lib/pet/scan";
import { expiryFor } from "@/lib/pet/calc";

/**
 * ワクチン・狂犬病・鑑札の書類写真をAIで読み、種類・日付・病院名などを返す(保存はしない。保存は確認後に別で行う)。
 * ログイン必須。1人1日30回まで(費用の暴走防止)。車検証の読取(app/api/vehicle-cert/scan)と同じ作り。
 * 画像はAIに渡すだけで、サーバーのストレージ・DB・ログには一切保存しない(このリクエストの処理が終われば破棄される)。
 * 書類の画像は、本人が保存したときだけ非公開の置き場(pet-private)に入り、10分で切れるリンクでだけ見られる。
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = 30;
const MAX_BASE64_CHARS = 4_000_000;

export async function POST(request: Request) {
  const viewer = await getPetViewer();
  if (!viewer) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "読み取り機能の設定がありません" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
  const mimeType = typeof body?.mimeType === "string" && /^image\/(jpeg|png|webp)$/.test(body.mimeType) ? body.mimeType : "image/jpeg";
  if (!imageBase64) return NextResponse.json({ error: "画像がありません" }, { status: 400 });
  if (imageBase64.length > MAX_BASE64_CHARS) return NextResponse.json({ error: "画像が大きすぎます" }, { status: 413 });

  const admin = petAdmin();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("locapass_pet_ai_scans").select("id", { count: "exact", head: true }).eq("user_id", viewer.userId).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return NextResponse.json({ error: `1日の読み取り回数(${DAILY_LIMIT}回)を超えました。手入力で登録できます` }, { status: 429 });
  await admin.from("locapass_pet_ai_scans").insert({ user_id: viewer.userId });

  const res = await geminiGenerateWithFallback(
    apiKey,
    {
      contents: [{ parts: [{ text: PET_SCAN_PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    },
    "pet-doc scan",
    45_000,
  );
  if (!res) return NextResponse.json({ error: "読み取りに失敗しました。少し待ってからもう一度お試しください" }, { status: 502 });

  const result = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) return NextResponse.json({ error: "うまく読み取れませんでした。明るい場所でもう一度撮影してください" }, { status: 502 });

  const scan = normalizePetScan(parsed);
  const expiresOn = expiryFor(scan.docType, { administeredOn: scan.administeredOn, nextDueOn: scan.nextDueOn, fiscalYear: scan.fiscalYear });
  return NextResponse.json({ scan, expiresOn });
}
