export type PetSex = "male" | "female" | "unknown";
export type PetVisibility = "private" | "followers" | "public";
export type PetDocType = "rabies" | "license" | "mixed_vaccine" | "other";

export type PetRow = {
  id: string;
  owner_id: string;
  name: string;
  breed: string | null;
  sex: PetSex;
  neutered: boolean | null;
  birthday: string | null;
  birthday_estimated: boolean;
  coat_color: string | null;
  weight_kg: number | null;
  microchip_no: string | null;
  registration_no: string | null;
  allergies: string | null;
  conditions: string | null;
  vet_name: string | null;
  insurance_name: string | null;
  insurance_no: string | null;
  features: string | null;
  avatar_path: string | null;
  cover_path: string | null;
  visibility: PetVisibility;
  card_public: boolean;
  tag_code: string;
  is_lost: boolean;
  sort_order: number;
  created_at: string;
};

export const PET_COLUMNS =
  "id, owner_id, name, breed, sex, neutered, birthday, birthday_estimated, coat_color, weight_kg, microchip_no, registration_no, allergies, conditions, vet_name, insurance_name, insurance_no, features, avatar_path, cover_path, visibility, card_public, tag_code, is_lost, sort_order, created_at";

export type PetDocumentRow = {
  id: string;
  pet_id: string;
  doc_type: PetDocType;
  title: string | null;
  administered_on: string | null;
  expires_on: string | null;
  clinic_name: string | null;
  vaccine_name: string | null;
  registration_no: string | null;
  note: string | null;
  image_path: string | null;
  created_at: string;
};

export type PetMedicalRow = {
  id: string;
  pet_id: string;
  visited_on: string;
  hospital: string | null;
  symptoms: string | null;
  diagnosis: string | null;
  medicines: string | null;
  cost: number | null;
  note: string | null;
  image_paths: string[];
  created_at: string;
};

export type PetDiaryRow = {
  id: string;
  pet_id: string;
  entry_date: string;
  weight_kg: number | null;
  body: string | null;
  image_paths: string[];
  visibility: PetVisibility;
  created_at: string;
};

export type PetLostReportRow = {
  id: string;
  pet_id: string;
  owner_id: string;
  status: "active" | "found" | "closed";
  last_seen_at: string | null;
  last_seen_lat: number | null;
  last_seen_lng: number | null;
  last_seen_address: string | null;
  features: string | null;
  photo_path: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  contact_note: string | null;
  alert_sent_count: number;
  created_at: string;
  resolved_at: string | null;
};

export const DOC_TYPE_LABEL: Record<PetDocType, string> = {
  rabies: "狂犬病予防注射(注射済票)",
  license: "鑑札(犬の登録)",
  mixed_vaccine: "混合ワクチン",
  other: "その他の書類",
};

export const DOC_TYPE_SHORT: Record<PetDocType, string> = {
  rabies: "狂犬病",
  license: "鑑札",
  mixed_vaccine: "混合ワクチン",
  other: "その他",
};

export const DOC_TYPE_EMOJI: Record<PetDocType, string> = {
  rabies: "💉",
  license: "🏷️",
  mixed_vaccine: "🩺",
  other: "📄",
};

export const SEX_LABEL: Record<PetSex, string> = { male: "男の子", female: "女の子", unknown: "ー" };

export const VISIBILITY_LABEL: Record<PetVisibility, string> = {
  private: "自分だけ",
  followers: "フォロワー",
  public: "だれでも",
};

/** よく選ばれる犬種(入力候補。リストにない犬種は自由に入力できる) */
export const BREED_SUGGESTIONS = [
  "トイ・プードル",
  "チワワ",
  "ミニチュア・ダックスフンド",
  "ポメラニアン",
  "柴犬",
  "ミニチュア・シュナウザー",
  "ヨークシャー・テリア",
  "シー・ズー",
  "マルチーズ",
  "フレンチ・ブルドッグ",
  "パピヨン",
  "ゴールデン・レトリーバー",
  "ラブラドール・レトリーバー",
  "ウェルシュ・コーギー・ペンブローク",
  "ジャック・ラッセル・テリア",
  "キャバリア・キング・チャールズ・スパニエル",
  "ビーグル",
  "パグ",
  "ボーダー・コリー",
  "秋田犬",
  "ミックス",
];

export const COAT_COLOR_SUGGESTIONS = ["ホワイト", "ブラック", "ブラウン", "レッド", "クリーム", "アプリコット", "ゴールド", "ブラック&タン", "ホワイト&ブラウン", "トライカラー", "シルバー", "ブリンドル", "赤(柴)", "黒(柴)", "胡麻(柴)"];
