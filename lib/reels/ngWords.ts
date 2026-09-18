// サーバー側(DBトリガー: reject_reel_comment_ng_words)と同じ一覧をクライアント側にも
// 持たせ、送信前に弾けるようにする(サーバー側が最終防衛、こちらはUXのための先行チェック)。
// 変更する場合は supabase/migrations の該当マイグレーションとこの配列を両方直すこと。
export const NG_WORDS = ["死ね", "殺す", "ブス", "晒す", "きもい", "ぶさいく", "デブス"];

export function containsNgWord(text: string): boolean {
  return NG_WORDS.some((w) => text.includes(w));
}
