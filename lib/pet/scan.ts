import type { PetDocType } from "./types";

/**
 * ワクチン・狂犬病・鑑札の書類をAI(Gemini)で読むときの指示。
 * 飼い主の氏名・住所・電話番号は読まない(返す項目は許可リストだけ。normalizePetScan で絞る)。
 */
export const PET_SCAN_PROMPT = `あなたは日本の犬の書類を読み取るアシスタントです。画像の書類について、次のJSONだけを返してください(説明文は不要)。
{
  "doc_type": "rabies" | "license" | "mixed_vaccine" | "other",
  "administered_on": "YYYY-MM-DD" または null,
  "fiscal_year": 西暦の年度(数値) または null,
  "next_due_on": "YYYY-MM-DD" または null,
  "clinic_name": 動物病院名 または null,
  "vaccine_name": ワクチン名(例「6種混合」「デュラミューン」) または null,
  "registration_no": 鑑札の登録番号・注射済票の番号 または null,
  "pet_name": 犬の名前 または null,
  "confidence": 0〜1の数値
}
判断のしかた:
- 「狂犬病予防注射済票」「注射済証」「狂犬病予防注射」→ rabies。金属やプラスチックの小さな札で「年度」だけが書かれていることが多い(例「令和7年度」= 2025年度 → fiscal_year: 2025)。
- 「鑑札」「犬の登録」→ license(期限はない)。
- 「混合ワクチン」「ワクチン接種証明書」「〇種混合」→ mixed_vaccine。次回接種予定日が書かれていれば next_due_on に入れる。
- 和暦は西暦に直す(令和n年 = 2018+n年、平成n年 = 1988+n年)。
- 読めない項目は null。推測で埋めない。
- 飼い主の氏名・住所・電話番号は絶対に出力しない。`;

export type PetScanResult = {
  docType: PetDocType;
  administeredOn: string | null;
  fiscalYear: number | null;
  nextDueOn: string | null;
  clinicName: string | null;
  vaccineName: string | null;
  registrationNo: string | null;
  petName: string | null;
  confidence: number | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const date = (v: unknown) => (typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

export function normalizePetScan(raw: unknown): PetScanResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = o.doc_type;
  const docType: PetDocType = t === "rabies" || t === "license" || t === "mixed_vaccine" ? t : "other";
  const fy = typeof o.fiscal_year === "number" && o.fiscal_year > 1990 && o.fiscal_year < 2100 ? Math.trunc(o.fiscal_year) : null;
  const conf = typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : null;
  return {
    docType,
    administeredOn: date(o.administered_on),
    fiscalYear: fy,
    nextDueOn: date(o.next_due_on),
    clinicName: str(o.clinic_name),
    vaccineName: str(o.vaccine_name),
    registrationNo: str(o.registration_no, 40),
    petName: str(o.pet_name, 40),
    confidence: conf,
  };
}
