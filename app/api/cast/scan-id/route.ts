import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geminiGenerateContentUrl } from "@/lib/gemini";

// 免許証・マイナンバーカードをGemini Vision APIでOCRし、構造化データとして返す。
// 画像はここで受け取って解析するのみで、どこにも保存しない(抽出結果のテキストのみ呼び出し元に返す)。
export const runtime = "nodejs";

const PROMPT = `これは日本の運転免許証またはマイナンバーカードの画像です。記載されている情報を読み取り、
以下のJSON形式で1つだけ出力してください。説明文やコードブロックの記号は不要です。
読み取れない項目はnullにしてください。生年月日は必ずYYYY-MM-DD形式(西暦)に変換してください
(和暦「昭和」「平成」「令和」の場合は西暦に変換すること)。フリガナが記載されていない場合は
氏名の漢字から一般的な読みを推定してカタカナで入力してください。

{
  "legal_name": "本名(氏名)",
  "legal_name_kana": "フリガナ(カタカナ)",
  "birth_date": "YYYY-MM-DD",
  "address": "住所(都道府県から番地まで)"
}`;

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
    return NextResponse.json(
      { error: "GEMINI_API_KEYが設定されていません" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const imageBase64 = body?.imageBase64 as string | undefined;
  const mimeType = (body?.mimeType as string | undefined) ?? "image/jpeg";
  if (!imageBase64) {
    return NextResponse.json({ error: "画像データがありません" }, { status: 400 });
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
    return NextResponse.json(
      { error: `OCR呼び出しに失敗しました: ${errText}` },
      { status: 502 },
    );
  }

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return NextResponse.json({ error: "OCR結果を取得できませんでした" }, { status: 502 });
  }

  let fields: {
    legal_name: string | null;
    legal_name_kana: string | null;
    birth_date: string | null;
    address: string | null;
  };
  try {
    fields = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "OCR結果の解析に失敗しました" }, { status: 502 });
  }

  return NextResponse.json({ fields });
}
