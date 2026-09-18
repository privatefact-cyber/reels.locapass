"use client";

// ログイン不要のいいねボタン用に、ブラウザごとのランダムIDをlocalStorageへ保存して使い回す。
// 認証は絡めない(誰でも押せる/取り消せるカジュアルな「いいね」の実装)。
const STORAGE_KEY = "modella_viewer_id";

export function getViewerId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
