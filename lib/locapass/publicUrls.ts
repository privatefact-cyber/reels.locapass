/**
 * 店舗・キャストの公開URLを組み立てる/読み解くための共通ヘルパー。
 *
 * キャストのURLは専用のslug列を持たず、都度「店舗slug + 発行番号」から組み立てる
 * (店舗slugが将来変わっても自動追従させるため。発行番号はlocapass_cast_members.issue_no、
 * 店舗ごとの連番で欠番は再利用されない)。
 */

export function shopPath(portalSlug: string, shopSlug: string): string {
  return `/${portalSlug}/shops/${shopSlug}`;
}

export function shopReelsPath(portalSlug: string, shopSlug: string): string {
  return `${shopPath(portalSlug, shopSlug)}/reels`;
}

/** 過去動画のストック(時系列/カレンダー検索)ページ。 */
export function shopArchivePath(portalSlug: string, shopSlug: string): string {
  return `${shopPath(portalSlug, shopSlug)}/archive`;
}

export function castSlugOf(shopSlug: string, issueNo: number): string {
  return `${shopSlug}-${issueNo}`;
}

export function castPath(portalSlug: string, shopSlug: string, issueNo: number): string {
  return `/${portalSlug}/cast/${castSlugOf(shopSlug, issueNo)}`;
}

export function castReelsPath(portalSlug: string, shopSlug: string, issueNo: number): string {
  return `${castPath(portalSlug, shopSlug, issueNo)}/reels`;
}

export function staffSlugOf(shopSlug: string, issueNo: number): string {
  return `${shopSlug}-${issueNo}`;
}

export function staffPath(portalSlug: string, shopSlug: string, issueNo: number): string {
  return `/${portalSlug}/staff/${staffSlugOf(shopSlug, issueNo)}`;
}

export function staffReelsPath(portalSlug: string, shopSlug: string, issueNo: number): string {
  return `${staffPath(portalSlug, shopSlug, issueNo)}/reels`;
}

/** "{shopSlug}-{issueNo}" 形式のスタッフslugを分解する(parseCastSlugと同じロジック)。 */
export function parseStaffSlug(staffSlug: string): { shopSlug: string; issueNo: number } | null {
  return parseCastSlug(staffSlug);
}

/**
 * "{shopSlug}-{issueNo}" 形式のキャストslugを分解する。
 * 店舗slug自体が"-2"のような数字サフィックスで終わる場合(重複解決で付与されたもの)にも
 * 対応するため、末尾の数字グループだけを発行番号として貪欲マッチで切り出す。
 */
export function parseCastSlug(castSlug: string): { shopSlug: string; issueNo: number } | null {
  const match = castSlug.match(/^(.+)-(\d+)$/);
  if (!match) return null;
  const issueNo = Number(match[2]);
  if (!Number.isInteger(issueNo)) return null;
  return { shopSlug: match[1], issueNo };
}
