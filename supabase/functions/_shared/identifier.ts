// 電話番号・氏名・生年月日をそれぞれ正規化した上でHMAC-SHA256ハッシュ化する共通ロジック。
//
// 電話番号のみでの一致判定は避ける(番号再割当による誤検知、
// 複数回線を使い分ける悪質人物の検知漏れを招くため)。
// 3項目のうち2項目以上が一致した場合のみ「該当あり」とする check_person_risk の
// 前提となるため、register / check の両エッジ関数で必ず同一の正規化・ハッシュ手順を使うこと。
//
// BLACKLIST_PEPPER はクライアントに一切公開されないサーバー専用シークレット。
// `supabase secrets set BLACKLIST_PEPPER=...` で設定する。

function toHalfWidthDigits(raw: string): string {
  return raw.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

function normalizePhone(raw: string): string {
  return toHalfWidthDigits(raw)
    .replace(/[^\d]/g, "")
    .replace(/^81/, "0")
    .replace(/^0*/, "0");
}

function normalizeName(raw: string): string {
  // 全角/半角・姓名間の空白(半角/全角)のゆれを吸収する。
  return raw.normalize("NFKC").replace(/[\s　]/g, "");
}

function normalizeDob(raw: string): string {
  // "2000/01/01" "2000年1月1日" "20000101" 等の表記ゆれを8桁の数字列に統一してからハッシュする。
  const digits = raw.normalize("NFKC").replace(/[^\d]/g, "");
  if (digits.length !== 8) {
    throw new Error(`invalid date of birth: ${raw}`);
  }
  return digits;
}

async function hmac(field: "phone" | "name" | "dob", normalized: string): Promise<string> {
  const pepper = Deno.env.get("BLACKLIST_PEPPER");
  if (!pepper) {
    throw new Error("BLACKLIST_PEPPER is not configured");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  // フィールド名をプレフィックスすることで、正規化後の文字列がフィールドをまたいで
  // 偶然一致した場合でも異なるハッシュになるようにする。
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${field}:${normalized}`),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPhone(raw: string): Promise<string> {
  return hmac("phone", normalizePhone(raw));
}

export async function hashName(raw: string): Promise<string> {
  return hmac("name", normalizeName(raw));
}

export async function hashDob(raw: string): Promise<string> {
  return hmac("dob", normalizeDob(raw));
}
