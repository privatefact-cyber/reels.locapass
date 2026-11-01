// 撮影者ページのSNSリンク。DBには「ユーザー名」と「https のURL」だけを入れ、表示のときにURLを組み立てる。
export type SnsLinks = { instagram: string | null; x: string | null; website: string | null };

/** 入力欄の文字(@付き・URL貼り付けも可)からユーザー名を取り出す。空欄は null、形式が違えば undefined。 */
function handle(raw: string, hosts: string[], pattern: RegExp): string | null | undefined {
  let v = raw.trim();
  if (!v) return null;
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)\/@?([^/?#]+)/i);
  if (m && hosts.includes(m[1].toLowerCase())) v = m[2];
  v = v.replace(/^@/, "");
  return pattern.test(v) ? v : undefined;
}

export const parseInstagram = (raw: string) => handle(raw, ["instagram.com"], /^[A-Za-z0-9._]{1,30}$/);
export const parseX = (raw: string) => handle(raw, ["x.com", "twitter.com"], /^[A-Za-z0-9_]{1,15}$/);

/** https のURLだけ受け付ける。空欄は null、形式が違えば undefined。 */
export function parseWebsite(raw: string): string | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    u.protocol = "https:";
    const s = u.toString();
    return s.length <= 200 ? s : undefined;
  } catch {
    return undefined;
  }
}

export function snsHrefs(l: SnsLinks): { key: "instagram" | "x" | "website"; label: string; href: string }[] {
  const out: { key: "instagram" | "x" | "website"; label: string; href: string }[] = [];
  if (l.instagram) out.push({ key: "instagram", label: `@${l.instagram}`, href: `https://www.instagram.com/${l.instagram}` });
  if (l.x) out.push({ key: "x", label: `@${l.x}`, href: `https://x.com/${l.x}` });
  if (l.website) out.push({ key: "website", label: l.website.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""), href: l.website });
  return out;
}
