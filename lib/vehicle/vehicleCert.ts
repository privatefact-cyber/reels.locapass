/**
 * 車検証(自動車検査証)の写真を読み取った結果を、在庫の入力欄に入れられる形に整える。サーバー専用の処理ではなく
 * 純粋な関数だけなので、テストしやすい。
 *
 * 個人情報の扱い(重要):
 * - 所有者・使用者の氏名/名称、住所、使用の本拠の位置、登録番号(ナンバー)は、読み取らない・返さない。
 *   AIへの指示でも禁止しているが、指示を無視されても漏れないよう、返す項目は下の許可リスト(ALLOWED_KEYS)だけにする。
 * - 画像も読取結果も、どこにも保存しない。
 */

export const ALLOWED_KEYS = ["maker", "model_code", "vin", "first_registration", "inspection_expiry", "body_type", "seats", "displacement", "fuel"] as const;

export const VEHICLE_CERT_PROMPT = `これは日本の自動車検査証(車検証)の画像です。車両そのものの情報だけを読み取り、
次のJSONを1つだけ出力してください。説明文やコードブロックの記号は不要です。読み取れない項目はnullにしてください。

絶対に読み取らない・出力しない項目: 所有者の氏名または名称、所有者の住所、使用者の氏名または名称、使用者の住所、
使用の本拠の位置、登録番号(ナンバープレートの文字)。これらは画像に写っていても、出力に含めないでください。

{
  "maker": "車名(例: ポルシェ、トヨタ)",
  "model_code": "型式(例: ABA-997M)",
  "vin": "車台番号",
  "first_registration": "初度登録年月(書かれているとおりに。例: 令和3年5月)",
  "inspection_expiry": "有効期間の満了する日(書かれているとおりに。例: 令和9年3月15日)",
  "body_type": "車体の形状(例: クーペ、ステーションワゴン)",
  "seats": 乗車定員の数字,
  "displacement": "総排気量またはリットル表記(書かれているとおりに。例: 3.80L または 2996cc)",
  "fuel": "燃料の種類(例: ガソリン、軽油、電気)"
}`;

export type VehicleCertFields = {
  /** 入力欄の「車名」に入れる候補(メーカー名)。 */
  title: string | null;
  maker: string | null;
  model_code: string | null;
  vin: string | null;
  /** 「2021年(R3)」の形。 */
  year: string | null;
  /** 「R9年3月」の形(車検の満了)。 */
  inspection: string | null;
  body_type: string | null;
  seats: number | null;
  displacement_cc: number | null;
  fuel: string | null;
};

const ERAS: { key: RegExp; base: number; sym: string }[] = [
  { key: /令和|^R/i, base: 2018, sym: "R" },
  { key: /平成|^H/i, base: 1988, sym: "H" },
  { key: /昭和|^S/i, base: 1925, sym: "S" },
];

/** 西暦から元号の記号を出す。2019年は4月まで平成31年、5月から令和1年なので、月が分かるときは月で分ける。 */
const eraSymbol = (y: number, m: number | null = null) => {
  if (y === 2019 && m !== null && m <= 4) return "H31";
  return y >= 2019 ? `R${y - 2018}` : y >= 1989 ? `H${y - 1988}` : `S${y - 1925}`;
};

/** 「令和3年5月」「R03.05」「2021年5月」「平成 18年 3月 15日」などを {年,月,日} にする。読めなければnull。 */
export function parseJaDate(raw: string | null | undefined): { y: number; m: number | null; d: number | null } | null {
  if (!raw) return null;
  const s = raw.replace(/[\s　]/g, "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  // 西暦
  let m = s.match(/^((?:19|20)\d{2})[年./-]?(\d{1,2})?[月./-]?(\d{1,2})?/);
  if (m) {
    const y = Number(m[1]);
    return { y, m: m[2] ? Number(m[2]) : null, d: m[3] ? Number(m[3]) : null };
  }
  // 和暦(元年にも対応)
  for (const era of ERAS) {
    if (!era.key.test(s)) continue;
    m = s.replace(/^(令和|平成|昭和|R|H|S)/i, "").match(/^(元|\d{1,2})[年./-]?(\d{1,2})?[月./-]?(\d{1,2})?/);
    if (!m) continue;
    const n = m[1] === "元" ? 1 : Number(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > 99) continue;
    return { y: era.base + n, m: m[2] ? Number(m[2]) : null, d: m[3] ? Number(m[3]) : null };
  }
  return null;
}

/** 「2021年(R3)」の形。 */
export function formatYear(raw: string | null | undefined): string | null {
  const d = parseJaDate(raw);
  if (!d || d.y < 1900 || d.y > new Date().getFullYear() + 1) return null;
  return `${d.y}年(${eraSymbol(d.y, d.m)})`;
}

/** 「R9年3月」の形(車検の満了。月が読めなければ年だけ)。 */
export function formatInspection(raw: string | null | undefined): string | null {
  const d = parseJaDate(raw);
  if (!d || d.y < 1990 || d.y > new Date().getFullYear() + 5) return null;
  return `${eraSymbol(d.y, d.m)}年${d.m ? `${d.m}月` : ""}`;
}

/** 「3.80L」「2996cc」「3,800 cc」などをccの数字にする。 */
export function parseDisplacementCc(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/[\s　,]/g, "").replace(/[０-９．]/g, (c) => (c === "．" ? "." : String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)(l|ｌ|リットル|cc|ｃｃ)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? "").toLowerCase();
  const cc = unit.startsWith("l") || unit === "ｌ" || unit === "リットル" || (!unit && n < 20) ? Math.round(n * 1000) : Math.round(n);
  return cc >= 50 && cc <= 20000 ? cc : null;
}

const str = (v: unknown, max = 60): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\s　]+/g, " ").trim();
  return t && t.toLowerCase() !== "null" ? t.slice(0, max) : null;
};

/**
 * AIの出力(JSON)を、許可リストの項目だけに絞って整える。許可リストにない項目(氏名・住所など)は、
 * AIが出力していても、ここで捨てる。
 */
export function normalizeVehicleCert(ai: unknown): VehicleCertFields {
  const src = ai && typeof ai === "object" ? (ai as Record<string, unknown>) : {};
  const picked: Record<string, unknown> = {};
  for (const k of ALLOWED_KEYS) picked[k] = src[k];

  const maker = str(picked.maker, 30);
  const vinRaw = str(picked.vin, 30);
  const seatsNum = Number(picked.seats);
  return {
    title: maker,
    maker,
    model_code: str(picked.model_code, 30),
    vin: vinRaw ? vinRaw.replace(/\s/g, "").toUpperCase() : null,
    year: formatYear(str(picked.first_registration, 30)),
    inspection: formatInspection(str(picked.inspection_expiry, 30)),
    body_type: str(picked.body_type, 20),
    seats: Number.isInteger(seatsNum) && seatsNum >= 1 && seatsNum <= 99 ? seatsNum : null,
    displacement_cc: parseDisplacementCc(str(picked.displacement, 20)),
    fuel: str(picked.fuel, 20),
  };
}
