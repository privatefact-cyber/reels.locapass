import { NextResponse } from "next/server";
import exifr from "exifr";
import { createClient } from "@/lib/supabase/server";
import { geminiGenerateContentUrl } from "@/lib/gemini";

// locapass_shops版の混雑状況判定API。luxela.jp(shops.occupancy_status)と同じ仕組みだが、
// ログインしているのは店舗本人ではなく管理コンソールの運営者/サイト管理者なので、
// shop_idをリクエストボディで受け取り、保存はlocapass_shopsのRLS(locapass_is_shop_admin)に
// 判定を委ねる(自分のportal_id以外の店舗をshop_idで指定してもRLSで弾かれる)。
export const runtime = "nodejs";

const PROMPT = `これは飲食店・接客店のフロアを撮影した写真です。写っている座席の埋まり具合から
混雑状況を判定し、以下のJSON形式で1つだけ出力してください。説明文やコードブロックの記号は不要です。

{
  "status": "available" | "few_seats" | "full",
  "estimated_available_seats": 空いている席数の推定(判定できない場合はnull)
}

判定基準: 空席が半分以上ならavailable、残り数席程度ならfew_seats、ほぼ埋まっているか満席ならfull。`;

type OccupancyStatus = "available" | "few_seats" | "full";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEYが設定されていません" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const shopId = body?.shopId as string | undefined;
  const imageBase64 = body?.imageBase64 as string | undefined;
  const mimeType = (body?.mimeType as string | undefined) ?? "image/jpeg";
  if (!shopId) {
    return NextResponse.json({ error: "店舗が指定されていません" }, { status: 400 });
  }
  if (!imageBase64) {
    return NextResponse.json({ error: "画像データがありません" }, { status: 400 });
  }

  // Exifの撮影日時を読む。読めない/存在しない写真(スクショ等)ならアップロード受信時刻を使う。
  // exifrはEXIFの日時文字列(タイムゾーン情報なし)をnew Date(y,m,d,h,mi,s)で組み立てるため、
  // サーバーの実行環境のタイムゾーン(Vercel上はUTC)で解釈されてしまう。国内向けサービスなので
  // 常にJST(+09:00)の壁時計時刻として扱いたいため、Date化させず生の文字列で受け取って自前で組み立てる。
  let capturedAt = new Date();
  try {
    const buffer = Buffer.from(imageBase64, "base64");
    const exifData = await exifr.parse(buffer, {
      pick: ["DateTimeOriginal"],
      translateValues: false,
      reviveValues: false,
    });
    const raw = exifData?.DateTimeOriginal as string | undefined;
    const match = raw?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (match) {
      const [, y, mo, d, h, mi, s] = match;
      capturedAt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`);
    }
  } catch {
    // Exifが壊れている/存在しない場合は受信時刻フォールバックのまま進める。
  }

  const response = await fetch(geminiGenerateContentUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json({ error: `混雑判定に失敗しました: ${errText}` }, { status: 502 });
  }

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return NextResponse.json({ error: "混雑判定の結果を取得できませんでした" }, { status: 502 });
  }

  let parsed: { status: OccupancyStatus; estimated_available_seats: number | null };
  try {
    const raw = JSON.parse(text);
    if (!["available", "few_seats", "full"].includes(raw.status)) {
      throw new Error("invalid status");
    }
    parsed = {
      status: raw.status,
      estimated_available_seats:
        typeof raw.estimated_available_seats === "number" ? raw.estimated_available_seats : null,
    };
  } catch {
    return NextResponse.json({ error: "混雑判定結果の解析に失敗しました" }, { status: 502 });
  }

  const occupancyStatus = {
    status: parsed.status,
    estimated_available_seats: parsed.estimated_available_seats,
    captured_at: capturedAt.toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("locapass_shops")
    .update({ occupancy_status: occupancyStatus })
    .eq("id", shopId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: `保存に失敗しました: ${error.message}` }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "保存に失敗しました(権限をご確認ください)" }, { status: 403 });
  }

  return NextResponse.json({ occupancyStatus });
}
