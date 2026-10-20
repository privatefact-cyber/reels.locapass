/**
 * Geminiのモデル名はここ1か所で持つ。
 *
 * 以前は身分証OCR(app/api/cast/scan-id)と住所翻訳がそれぞれ文字列を持っていて、
 * `gemini-3.6-flash` が提供終了(404)したときにOCR側だけ古いまま残り、
 * 機能が動かなくなっていることに気付けなかった。
 *
 * モデルを上げるときは必ずここだけを書き換えること。
 */
export const GEMINI_MODEL = "gemini-3.6-flash";

export function geminiGenerateContentUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

/**
 * 字幕の翻訳など「大量に回す軽い処理」用の軽量モデル(2026-09時点で街の声の蒸留でも使用中)。
 * 提供終了で404になったらここだけを書き換える。
 */
export const GEMINI_LITE_MODEL = "gemini-2.5-flash-lite";

export function geminiLiteGenerateContentUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LITE_MODEL}:generateContent?key=${apiKey}`;
}

/**
 * 画像つきの生成(写真の一言・審査)用の予備モデル。主モデルが混雑(503)や上限(429)のときだけ使う。
 * 2026-10-20に主モデルが503を返し続け、写真の「AIおまかせ生成」が使えなくなったことへの対策。
 */
export const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

/**
 * generateContentを呼ぶ。主モデルが一時的なエラー(429/500/502/503/504)や通信失敗のときは、少し待って1回やり直し、
 * それでもだめなら予備モデルに切り替える。成功したResponseを返し、全部失敗したらnull。
 * (404など恒久的なエラーはやり直さず、すぐ予備に切り替える。)
 */
export async function geminiGenerateWithFallback(apiKey: string, body: unknown, label: string, timeoutMs = 25_000): Promise<Response | null> {
  const attempts: { model: string; delayMs: number }[] = [
    { model: GEMINI_MODEL, delayMs: 0 },
    { model: GEMINI_MODEL, delayMs: 1200 },
    { model: GEMINI_FALLBACK_MODEL, delayMs: 0 },
  ];
  const retryable = new Set([429, 500, 502, 503, 504]);
  let skipSecondPrimary = false;
  for (let i = 0; i < attempts.length; i++) {
    const { model, delayMs } = attempts[i];
    if (i === 1 && skipSecondPrimary) continue;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) },
      );
      if (res.ok) return res;
      console.error(`${label}: ${model} ${res.status}`);
      if (!retryable.has(res.status)) skipSecondPrimary = true; // 恒久的なエラーは同じモデルでやり直さない
    } catch (e) {
      console.error(`${label}: ${model} failed`, e);
    }
  }
  return null;
}
