function formatJst(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });
}

/** イベントの開始日〜終了日を "9/1〜9/7" のように短く表示する。両方nullなら空文字。 */
export function formatEventDateRange(event: { startsAt: string | null; endsAt: string | null }): string {
  const { startsAt, endsAt } = event;
  if (startsAt && endsAt) {
    const start = formatJst(startsAt);
    const end = formatJst(endsAt);
    return start === end ? start : `${start}〜${end}`;
  }
  if (startsAt) return `${formatJst(startsAt)}〜`;
  if (endsAt) return `〜${formatJst(endsAt)}`;
  return "";
}
