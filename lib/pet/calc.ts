import type { PetDocType } from "./types";

/** 今日(日本時間)の YYYY-MM-DD */
export function todayJst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

function parseDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** 2つの日付の差(日数)。b - a */
export function daysBetween(a: string, b: string): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export function addYears(date: string, years: number): string {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y + years, m - 1, d));
  // 2/29 → 翌年は 3/1 になるので 2/28 に寄せる
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
}

/** 年齢(年・月)。誕生日が未来・未入力なら null */
export function ageOf(birthday: string | null, today = todayJst()): { years: number; months: number } | null {
  if (!birthday) return null;
  const b = parseDate(birthday);
  const t = parseDate(today);
  let months = (t.y - b.y) * 12 + (t.m - b.m);
  if (t.d < b.d) months -= 1;
  if (months < 0) return null;
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** 「3歳2か月」「5か月」 */
export function ageLabel(birthday: string | null, estimated = false): string | null {
  const age = ageOf(birthday);
  if (!age) return null;
  const core = age.years === 0 ? `${age.months}か月` : age.months === 0 ? `${age.years}歳` : `${age.years}歳${age.months}か月`;
  return estimated ? `${core}(推定)` : core;
}

/**
 * 人間でいうと何歳くらいか(目安)。
 * 一般的な換算: 1歳≒15歳、2歳≒24歳、以降は小型・中型犬で1年≒4歳、大型犬(25kg以上)で1年≒7歳。
 */
export function humanAge(birthday: string | null, weightKg: number | null): number | null {
  const age = ageOf(birthday);
  if (!age) return null;
  const y = age.years + age.months / 12;
  if (y < 1) return Math.round(y * 15);
  if (y < 2) return Math.round(15 + (y - 1) * 9);
  const perYear = weightKg != null && weightKg >= 25 ? 7 : 4;
  return Math.round(24 + (y - 2) * perYear);
}

/** 次の誕生日まで何日か(誕生日が未入力なら null) */
export function daysToBirthday(birthday: string | null, today = todayJst()): number | null {
  if (!birthday) return null;
  const b = parseDate(birthday);
  const t = parseDate(today);
  let next = `${t.y}-${String(b.m).padStart(2, "0")}-${String(b.d).padStart(2, "0")}`;
  if (daysBetween(today, next) < 0) next = `${t.y + 1}-${String(b.m).padStart(2, "0")}-${String(b.d).padStart(2, "0")}`;
  return daysBetween(today, next);
}

/**
 * 書類の「次の期限」を決める。
 * - 鑑札: 期限なし(生涯1回の登録)
 * - 狂犬病: 年1回(法律で毎年度。4〜6月が注射の時期)。書類に次回日があればそれ、無ければ接種日の1年後、
 *   日付がなく年度しか読めないときは「次の年度の6月30日」
 * - 混合ワクチン: 証明書の次回予定日。無ければ接種日の1年後
 * - その他: 書いてあれば次回予定日
 */
export function expiryFor(docType: PetDocType, opts: { administeredOn?: string | null; nextDueOn?: string | null; fiscalYear?: number | null }): string | null {
  const { administeredOn, nextDueOn, fiscalYear } = opts;
  if (docType === "license") return null;
  if (nextDueOn) return nextDueOn;
  if (docType === "rabies") {
    if (administeredOn) return addYears(administeredOn, 1);
    if (fiscalYear) return `${fiscalYear + 1}-06-30`;
    return null;
  }
  if (docType === "mixed_vaccine" && administeredOn) return addYears(administeredOn, 1);
  return null;
}

export type ExpiryStatus = "none" | "valid" | "soon" | "expired";

/** 有効/もうすぐ(30日以内)/期限切れ */
export function expiryStatus(expiresOn: string | null, today = todayJst()): ExpiryStatus {
  if (!expiresOn) return "none";
  const left = daysBetween(today, expiresOn);
  if (left < 0) return "expired";
  if (left <= 30) return "soon";
  return "valid";
}

export function formatJpDate(date: string | null): string {
  if (!date) return "ー";
  const { y, m, d } = parseDate(date);
  return `${y}年${m}月${d}日`;
}

/** 種類ごとに一番新しい(期限が一番先の)書類だけを残す。期限のお知らせ・手帳のまとめ表示に使う。 */
export function latestByType<T extends { doc_type: PetDocType; expires_on: string | null; administered_on: string | null; created_at: string }>(docs: T[]): Map<PetDocType, T> {
  const out = new Map<PetDocType, T>();
  const key = (d: T) => d.expires_on ?? d.administered_on ?? d.created_at.slice(0, 10);
  for (const d of docs) {
    const cur = out.get(d.doc_type);
    if (!cur || key(d) > key(cur)) out.set(d.doc_type, d);
  }
  return out;
}
