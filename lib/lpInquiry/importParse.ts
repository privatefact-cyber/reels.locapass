import { extractEmail, type InquiryStatus, type InquiryType } from "./shared";

/** 取り込む1件ぶん(保存の形に近いもの)。 */
export type ParsedInquiry = {
  type: InquiryType;
  status: InquiryStatus | null;
  subject: string;
  name: string;
  contact: string;
  area: string | null;
  note: string | null;
  details: Record<string, string>;
  createdAt: string | null;
};

const STATUS_WORDS: Record<string, InquiryStatus> = { 新規: "new", 対応中: "in_progress", 返信済み: "replied", 返信済: "replied", 完了: "closed" };

function parseType(raw: string, fallback: InquiryType): InquiryType {
  const v = raw.trim();
  if (!v) return fallback;
  if (/代理店|agency/i.test(v)) return "agency";
  if (/掲載|店|shop/i.test(v)) return "shop";
  return fallback;
}

/** "2026/11/05 10:30"、"2026-11-05"、ISO などを日時にする。タイムゾーンが無いものは日本時間として扱う。 */
export function parseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const m = v.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const p = (n: string | undefined) => (n ?? "0").padStart(2, "0");
    const d = new Date(m[1] + "-" + p(m[2]) + "-" + p(m[3]) + "T" + p(m[4]) + ":" + p(m[5]) + ":" + p(m[6]) + "+09:00");
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const clip = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n);

type FieldKey = "subject" | "name" | "contact" | "email" | "tel" | "area" | "genre" | "biz" | "description" | "url" | "note" | "date" | "type" | "status";
type Fields = Partial<Record<FieldKey, string>>;

function build(f: Fields, defaultType: InquiryType): ParsedInquiry | { error: string } {
  const subject = clip(f.subject, 120);
  const contact = clip(f.contact || f.email || f.tel, 160);
  if (!subject) return { error: "店舗名・会社名がありません" };
  if (!contact) return { error: "連絡先がありません" };
  const details: Record<string, string> = {};
  if (clip(f.genre, 80)) details.genre = clip(f.genre, 80);
  if (clip(f.url, 300)) details.url = clip(f.url, 300);
  if (clip(f.biz, 120)) details.biz = clip(f.biz, 120);
  if (clip(f.description, 1000)) details.description = clip(f.description, 1000);
  // 連絡先と別に電話番号があるとき(メールと電話の両方が入力されたとき)は、電話番号を別の項目として残す。
  if (clip(f.tel, 40) && clip(f.tel, 40) !== contact) details.tel = clip(f.tel, 40);
  const status = f.status ? (STATUS_WORDS[f.status.trim()] ?? null) : null;
  return {
    type: parseType(f.type ?? "", defaultType),
    status,
    subject,
    name: clip(f.name, 80) || "(未記入)",
    contact,
    area: clip(f.area, 120) || null,
    note: clip(f.note, 3000) || null,
    details,
    createdAt: f.date ? parseDate(f.date) : null,
  };
}

const HEADER_MAP: Record<string, FieldKey> = {
  受付日時: "date", 日時: "date", 受付日: "date",
  種別: "type", 状態: "status",
  店舗名: "subject", "店舗名・施設名": "subject", 会社名: "subject", "店舗名・会社名": "subject",
  ご担当者名: "name", 担当者名: "name", 担当者: "name", お名前: "name", 名前: "name",
  連絡先: "contact", メールアドレス: "email", メール: "email", 電話番号: "tel", 電話: "tel",
  所在地: "area", エリア: "area",
  業種: "genre", 事業内容: "biz", 事業の詳細: "description", URL: "url", "公式サイト・SNSのURL": "url",
  ご相談内容: "note", "ご相談内容・ご質問": "note", 相談内容: "note", 備考: "note",
};

/** 1行目が見出しのCSV(書き出したCSVと同じ見出し名。必要な列だけでよい)を、取り込む形にする。 */
export function parseCsvInquiries(rows: string[][], defaultType: InquiryType): { items: ParsedInquiry[]; errors: string[] } {
  if (rows.length < 2) return { items: [], errors: ["見出しの行と、データの行が必要です"] };
  const header = rows[0].map((h) => HEADER_MAP[h.trim().replace(/\s/g, "")] ?? null);
  if (!header.includes("subject")) return { items: [], errors: ["見出しに「店舗名」または「会社名」の列がありません"] };
  const items: ParsedInquiry[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const f: Fields = {};
    header.forEach((key, c) => {
      if (key && r[c] !== undefined) f[key] = r[c];
    });
    const built = build(f, defaultType);
    if ("error" in built) errors.push((i + 2) + "行目: " + built.error);
    else items.push(built);
  });
  return { items, errors };
}

const LABELS: [RegExp, FieldKey][] = [
  [/^(店舗名・施設名|店舗名|施設名|会社名)\s*[:：]/, "subject"],
  [/^(ご担当者名|担当者名|担当者|お名前)\s*[:：]/, "name"],
  [/^(メールアドレス\s*or\s*電話番号|連絡先)\s*[:：]/i, "contact"],
  [/^メール(アドレス)?\s*[:：]/, "email"],
  [/^電話(番号)?\s*[:：]/, "tel"],
  [/^(所在地(\(市区町村\))?|エリア)\s*[:：]/, "area"],
  [/^業種\s*[:：]/, "genre"],
  [/^事業内容\s*[:：]/, "biz"],
  [/^事業の詳細\s*[:：]/, "description"],
  [/^(公式サイト・SNSのURL|URL)\s*[:：]/, "url"],
  [/^(ご相談内容・ご質問|ご相談内容|相談内容)\s*[:：]/, "note"],
];

/**
 * 過去のお問い合わせメール(フォームから送られた「店舗名:〇〇」のような行が並ぶ本文)を、1件ずつの問い合わせにする。
 * 複数のメールは、「====」だけの行で区切って貼る。ご相談内容は、次の項目の前まで(複数行も)含める。
 */
export function parseMailBodies(text: string, defaultType: InquiryType): { items: ParsedInquiry[]; errors: string[] } {
  const blocks = text.split(/^\s*={3,}\s*$/m).map((b) => b.trim()).filter(Boolean);
  const items: ParsedInquiry[] = [];
  const errors: string[] = [];
  blocks.forEach((block, i) => {
    const f: Fields = {};
    let current: FieldKey | null = null;
    for (const line of block.split(/\r\n|\n|\r/)) {
      const hit = LABELS.find(([re]) => re.test(line.trim()));
      if (hit) {
        current = hit[1];
        f[current] = line.trim().replace(/^[^:：]*[:：]\s*/, "");
      } else if (current === "note" && f.note !== undefined) {
        f.note += "\n" + line;
      }
    }
    // 連絡先の欄が無く、メールアドレスの欄だけあるときは、それを連絡先にする。
    if (!f.contact && f.email && extractEmail(f.email)) f.contact = f.email;
    const built = build(f, defaultType);
    if ("error" in built) errors.push((i + 1) + "通目: " + built.error);
    else items.push(built);
  });
  return { items, errors };
}
