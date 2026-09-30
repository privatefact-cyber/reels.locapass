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
