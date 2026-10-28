// locapassの店舗情報 → Googleビジネスプロフィール(Business Information API)の更新内容へ変換する。
import { DAY_KEYS, effectiveClose, sanitizeWeekly, type DayKey } from "@/lib/shop/businessHours";

export type GbpShopInput = {
  name: string | null;
  address: string | null;
  tel: string | null;
  description: string | null;
  business_hours_weekly: unknown;
  is_temporarily_closed: boolean | null;
};

export type GbpToggles = { sync_hours: boolean; sync_phone: boolean; sync_description: boolean; sync_name: boolean; sync_address: boolean };

type TimeOfDay = { hours: number; minutes: number };
type Period = { openDay: string; openTime: TimeOfDay; closeDay: string; closeTime: TimeOfDay };

export type GbpPatch = {
  /** PATCHのupdateMask(カンマ区切り)。送るものが無ければ空文字 */
  updateMask: string;
  location: Record<string, unknown>;
};

const GBP_DAYS: Record<DayKey, string> = {
  mon: "MONDAY",
  tue: "TUESDAY",
  wed: "WEDNESDAY",
  thu: "THURSDAY",
  fri: "FRIDAY",
  sat: "SATURDAY",
  sun: "SUNDAY",
};

const DESCRIPTION_MAX = 750;

function tod(t: string): TimeOfDay {
  const [h, m] = t.split(":").map(Number);
  return { hours: h, minutes: m };
}

/** 曜日ごとの営業時間 → Googleのperiods。深夜またぎ(close<=open)は閉店を翌日にする。LASTは03:00扱い。 */
export function buildPeriods(raw: unknown): Period[] {
  const weekly = sanitizeWeekly(raw);
  if (!weekly) return [];
  const periods: Period[] = [];
  DAY_KEYS.forEach((day, i) => {
    for (const r of weekly[day].ranges) {
      const close = effectiveClose(r);
      const overnight = close <= r.open;
      periods.push({
        openDay: GBP_DAYS[day],
        openTime: tod(r.open),
        closeDay: GBP_DAYS[DAY_KEYS[overnight ? (i + 1) % 7 : i]],
        closeTime: tod(close),
      });
    }
  });
  return periods;
}

/** 電話番号をGoogleが受け付ける形(数字とハイフン・先頭の+)に整える。空ならnull */
export function normalizePhone(tel: string | null): string | null {
  const v = (tel ?? "").trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^\d+\-]/g, "");
  return v.replace(/\D/g, "").length >= 9 ? v : null;
}

const NAME_MAX = 100;

/**
 * Googleに送る店名。locapassの店名にある括弧書き(読み仮名・補足)は、Googleの店名ルール(実際の看板どおり)に合わないので取り除く。
 * 例: 「RECOCO（レココ）渋谷店」→「RECOCO渋谷店」。空になる場合はnull(送らない)。
 */
export function cleanShopName(raw: string | null): string | null {
  const v = (raw ?? "").replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return v || null;
}

/** 「東京都渋谷区渋谷1-23-16 cocoti 3F」→ Googleの住所形式。都道府県・市区町村を読み取れなければnull(送らない) */
export function buildStorefrontAddress(raw: string | null): Record<string, unknown> | null {
  const v = (raw ?? "").replace(/〒?\s*\d{3}-?\d{4}/, "").replace(/\s+/g, " ").trim();
  const zip = (raw ?? "").match(/〒?\s*(\d{3}-?\d{4})/)?.[1];
  const m = v.match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)([^市区町村郡]+?市[^市区町村郡]+?区|[^市区町村郡]+?郡[^市区町村郡]+?[町村]|.+?[市区町村])(.+)$/);
  if (!m) return null;
  return {
    regionCode: "JP",
    languageCode: "ja",
    ...(zip ? { postalCode: zip } : {}),
    administrativeArea: m[1],
    locality: m[2],
    addressLines: [m[3].trim()],
  };
}

export function buildPatch(shop: GbpShopInput, toggles: GbpToggles): GbpPatch {
  const mask: string[] = [];
  const location: Record<string, unknown> = {};

  if (toggles.sync_hours) {
    // 臨時休業はGoogle側の「一時休業」に、そうでなければ通常営業(OPEN)にそろえる
    mask.push("openInfo");
    location.openInfo = { status: shop.is_temporarily_closed ? "CLOSED_TEMPORARILY" : "OPEN" };
    const periods = buildPeriods(shop.business_hours_weekly);
    if (periods.length) {
      mask.push("regularHours");
      location.regularHours = { periods };
    }
  }
  if (toggles.sync_name) {
    const title = cleanShopName(shop.name);
    if (title) {
      mask.push("title");
      location.title = title;
    }
  }
  if (toggles.sync_address) {
    const addr = buildStorefrontAddress(shop.address);
    if (addr) {
      mask.push("storefrontAddress");
      location.storefrontAddress = addr;
    }
  }
  if (toggles.sync_phone) {
    const phone = normalizePhone(shop.tel);
    if (phone) {
      mask.push("phoneNumbers.primaryPhone");
      location.phoneNumbers = { primaryPhone: phone };
    }
  }
  if (toggles.sync_description) {
    const d = (shop.description ?? "").trim();
    if (d) {
      mask.push("profile");
      location.profile = { description: d.slice(0, DESCRIPTION_MAX) };
    }
  }
  return { updateMask: mask.join(","), location };
}
