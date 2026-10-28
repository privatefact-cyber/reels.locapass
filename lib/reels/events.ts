/** ボトムナビ/ヘッダーのハンバーガーボタンが飛ばすカスタムイベント名。 */
export const OPEN_FEED_GATE_EVENT = "modella:open-gate";

/** ボトムナビ/フィードの検索ボタンが飛ばすカスタムイベント名(検索モーダルを開閉する)。 */
export const OPEN_SEARCH_EVENT = "modella:open-search";

/** ボトムナビのNOWボタンが飛ばすカスタムイベント名(「今稼働中」絞り込みを開閉する)。 */
export const TOGGLE_NOW_EVENT = "modella:toggle-now";

/**
 * メニューのシートから「見るもの」を直接選ぶためのカスタムイベント(ホームのフィードが受け取る)。
 * ホーム以外のページからは、同じ種類を ?feed=... でホームへ渡す。
 */
export const SELECT_FEED_EVENT = "modella:select-feed";
export type FeedKind = "shop" | "shop-reel" | "faces-reel";
export const FEED_KINDS: FeedKind[] = ["shop", "shop-reel", "faces-reel"];
