/**
 * 迷子・通報のページは検索に出すため、電話番号・メールアドレス・LINE IDのような連絡先をHTMLに載せない。
 * 連絡先は「連絡先を表示」ボタンを押したときだけ、サーバーから取りに行く(app/pet/actions.ts の reveal*)。
 * 自由入力(特徴・ひとこと等)に連絡先が書かれていた場合も、ここで伏せ字にする。
 */
const PHONE = /(?:\+?81[-\s]?|0)\d{1,4}[-\s(（)）]{0,2}\d{1,4}[-\s)）]?\d{3,4}/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINE_ID = /(?:LINE|ライン|line)\s*(?:ID|ＩＤ|id)?\s*[:：]?\s*[@\w.-]{3,}/g;

export const MASK = "(連絡先はボタンで表示)";

export function maskContacts(text: string | null): { text: string | null; masked: boolean } {
  if (!text) return { text, masked: false };
  let masked = false;
  const out = text
    .replace(LINE_ID, () => ((masked = true), MASK))
    .replace(EMAIL, () => ((masked = true), MASK))
    .replace(PHONE, (m) => {
      // 数字が10桁未満は日付・番地などなので伏せない
      if (m.replace(/\D/g, "").length < 10) return m;
      masked = true;
      return MASK;
    });
  return { text: out, masked };
}
