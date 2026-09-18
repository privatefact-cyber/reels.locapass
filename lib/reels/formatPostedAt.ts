/** リールカードにさりげなく出す投稿日時。JSTで「9/4 14:23」のように短く表示する。 */
export function formatPostedAt(isoString: string): string {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
