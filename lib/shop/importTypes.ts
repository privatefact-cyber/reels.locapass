import type { ImportPreview, ImportedPriceItem } from "@/lib/shop/importFromWebsite";

/** 公式サイトからの取り込み(店舗情報画面の ShopImportPanel)で使う型。 */
export type PreviewImportResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };

export type ApplyImportInput = {
  description: string | null;
  businessHours: string | null;
  phone: string | null;
  priceItems: ImportedPriceItem[];
  coverImageUrl: string | null;
  heroImageUrl: string | null;
  /** 取り込む写真・文章を店舗ページに使う権利がある、という店舗の確認。未確認なら反映しない。 */
  rightsConfirmed: boolean;
};

export type ApplyImportResult = { ok: true; applied: string[] } | { ok: false; error: string };
