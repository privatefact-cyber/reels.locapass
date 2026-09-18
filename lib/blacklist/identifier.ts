// supabase/functions/_shared/identifier.ts のNode.js版(Server Action用)。
// 生成ロジックはEdge Function側と完全に同一でなければ照合できないため、
// どちらか一方だけを直接編集しないこと(変更したら両方に反映する)。
//
// BLACKLIST_PEPPER はサーバー専用のシークレット(NEXT_PUBLIC_を付けない)。

function toHalfWidthDigits(raw: string): string {
  return raw.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

function normalizePhone(raw: string): string {
  return toHalfWidthDigits(raw)
    .replace(/[^\d]/g, "")
    .replace(/^81/, "0")
    .replace(/^0*/, "0");
}

function normalizeName(raw: string): string {
  return raw.normalize("NFKC").replace(/[\s　]/g, "");
}

function normalizeDob(raw: string): string {
  const digits = raw.normalize("NFKC").replace(/[^\d]/g, "");
  if (digits.length !== 8) {
    throw new Error(`invalid date of birth: ${raw}`);
  }
  return digits;
}

async function hmac(field: "phone" | "name" | "dob", normalized: string): Promise<string> {
  const pepper = process.env.BLACKLIST_PEPPER;
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
