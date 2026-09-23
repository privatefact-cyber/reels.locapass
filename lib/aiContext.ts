/**
 * 画面で今選ばれている検索キーワード・ジャンルタグを、コンシェルジュAI(AiInquiryWidget)へ渡すための
 * 小さな共有ストア。フィード/マップ側が publish し、ウィジェットは送信時に get して読むだけ。
 * 画面を離れる(アンマウント)ときは空に戻す。
 */
export type AiSelectedContext = { keyword: string; genres: string[] };

let current: AiSelectedContext = { keyword: "", genres: [] };

export function setAiSelectedContext(next: AiSelectedContext) {
  current = next;
}

export function getAiSelectedContext(): AiSelectedContext {
  return current;
}
