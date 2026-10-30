import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/supabase";
import { needsTranslation, preserveManualTranslations, translateFieldsBatch, type SourceFields, type TranslationTarget } from "@/lib/i18n/contentTranslation";
import { itemSourceFields } from "@/lib/shop/items";
import { normalizeInputLang } from "@/lib/shop/inputLang";
import { translateAddressesToEnglish } from "@/lib/map/translateAddress";

/**
 * 翻訳の取りこぼしを拾う自動処理(毎晩 /api/cron/translations から呼ぶ)。サーバー専用。
 *
 * 保存時の自動翻訳(店舗情報・車両・リール投稿文)が一時的に失敗したときや、管理画面を通さずに
 * データを入れたとき(まとめ登録・取り込み)に、翻訳が無い/日本語が変わって古い行を見つけて作り直す。
 * 日本語が変わっていない行は何もしない(needsTranslation)ので、何度走らせても安全で、
 * 翻訳APIの費用が増えるのは「新しい・変わった文章」の分だけ。
 *
 * 店舗の住所は、住所があるのに英語表記(address_en)が無い店舗だけ、英語表記を作る。
 *
 * 1回の実行で翻訳する行数に上限(maxRows)を設ける。店舗が一気に増えても、費用と実行時間が膨らまないよう、
 * 残りは翌晩に持ち越す。優先順位は 店舗 → 車両 → リール(新しい順)。
 */

const BATCH_SIZE = 5;

type Row = { id: string; translations: unknown } & Record<string, unknown>;

type Target = {
  table: "locapass_shops" | "locapass_shop_items" | "locapass_reels" | "locapass_shop_events" | "locapass_shop_price_items" | "official_site_content" | "official_posts";
  label: string;
  select: string;
  /** 翻訳を入れる列。未指定は translations。 */
  translationsCol?: string;
  /** 行を特定する列(更新のとき使う)。 */
  idCols?: string[];
  /** 店舗で絞るときの列名(特定の店舗の分だけ翻訳したいとき)。 */
  shopCol: string;
  /** 翻訳する言語。未指定は全部(英・中・アラビア語)。公式サイトは英・中だけ。 */
  targets?: readonly TranslationTarget[];
  /** 取得の絞り込み(公開中のものだけ等)。 */
  query: (q: any) => any;
  fieldsOf: (row: Row) => SourceFields;
};

/** 店舗が入力言語を指定している表(店舗の文章)。指定があれば、自動判定ではなくその言語を原文として訳す。 */
const SHOP_INPUT_LANG_TABLES = new Set<Target["table"]>(["locapass_shops", "locapass_shop_items", "locapass_reels", "locapass_shop_events", "locapass_shop_price_items"]);

const TARGETS: Target[] = [
  {
    table: "locapass_shops",
    label: "shops",
    select: "id, description, tagline, business_hours, price_info, usage_notes, translations, input_lang",
    shopCol: "id",
    query: (q) => q.eq("status", "active"),
    fieldsOf: (r) => ({
      description: r.description as string | null,
      tagline: r.tagline as string | null,
      business_hours: r.business_hours as string | null,
      price_info: r.price_info as string | null,
      usage_notes: r.usage_notes as string | null,
    }),
  },
  {
    table: "locapass_shop_items",
    label: "items",
    select: "id, shop_id, title, description, price_label, attributes, translations",
    shopCol: "shop_id",
    query: (q) => q.neq("status", "hidden"),
    fieldsOf: (r) => itemSourceFields(r as unknown as Parameters<typeof itemSourceFields>[0]),
  },
  {
    table: "locapass_reels",
    label: "reels",
    select: "id, shop_id, caption, translations",
    shopCol: "shop_id",
    query: (q) => q.eq("status", "publish").not("caption", "is", null).order("published_at", { ascending: false }).limit(2000),
    fieldsOf: (r) => ({ caption: r.caption as string | null }),
  },
  {
    // 出店予定・イベント(タイトル・本文・住所)。移動販売の出店予定は住所も訳す(英語表示で日本語の住所が出ないように)。
    table: "locapass_shop_events",
    label: "events",
    select: "id, shop_id, title, body, address, translations, ends_at",
    shopCol: "shop_id",
    // 終わったイベントは訳さない(費用を抑える)。
    query: (q) => q.or("ends_at.is.null,ends_at.gte.now()").limit(2000),
    fieldsOf: (r) => ({ title: r.title as string | null, body: r.body as string | null, address: r.address as string | null }),
  },
  {
    // 料金表・メニューの項目名(別の列 name_translations に入れる)。
    table: "locapass_shop_price_items",
    label: "price_items",
    select: "id, shop_id, name, name_translations",
    translationsCol: "name_translations",
    shopCol: "shop_id",
    query: (q) => q.limit(3000),
    fieldsOf: (r) => ({ name: r.name as string | null }),
  },
  {
    // 公式サイトの文言。日本語(ひらがな・カタカナ・漢字)を含む値だけ訳す(英語だけの見出し「Drive」などは、全言語でそのまま使う)。
    table: "official_site_content",
    label: "official_content",
    select: "shop_id, key, value, translations",
    idCols: ["shop_id", "key"],
    shopCol: "shop_id",
    targets: ["en", "zh"],
    query: (q) => q,
    fieldsOf: (r) => ({ value: /[\u3040-\u30ff\u4e00-\u9fff]/.test(String(r.value ?? "")) && !["youtube_url", "email"].includes(String(r.key)) ? (r.value as string) : null }),
  },
  {
    table: "official_posts",
    label: "official_posts",
    select: "id, title, body, translations",
    shopCol: "shop_id",
    targets: ["en", "zh"],
    query: (q) => q.eq("status", "published"),
    fieldsOf: (r) => ({ title: r.title as string | null, body: r.body as string | null }),
  },
];

export async function sweepTranslations(
  db: SupabaseClient<any>,
  opts: { maxRows?: number; deadlineMs?: number; shopId?: string } = {},
): Promise<{ results: Record<string, { checked: number; stale: number; translated: number; failed: number }>; remaining: number; stoppedEarly: boolean }> {
  const maxRows = opts.maxRows ?? 60;
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000);
  let budget = maxRows;
  let remaining = 0;
  let stoppedEarly = false;
  const results: Record<string, { checked: number; stale: number; translated: number; failed: number }> = {};

  // 入力言語を指定している店舗(店舗ID → 言語)。
  const inputLangByShop = new Map<string, string>();
  {
    const { data: langRows } = await db.from("locapass_shops").select("id, input_lang").not("input_lang", "is", null);
    for (const r of (langRows ?? []) as { id: string; input_lang: string | null }[]) {
      const lang = normalizeInputLang(r.input_lang);
      if (lang) inputLangByShop.set(r.id, lang);
    }
  }

  for (const target of TARGETS) {
    const hintOf = (r: Row): string | null => (SHOP_INPUT_LANG_TABLES.has(target.table) ? (inputLangByShop.get(String(r[target.shopCol])) ?? null) : null);
    const stat = { checked: 0, stale: 0, translated: 0, failed: 0 };
    results[target.label] = stat;

    let q = target.query(db.from(target.table).select(target.select));
    if (opts.shopId) q = q.eq(target.shopCol, opts.shopId);
    const { data, error } = await q;
    if (error) {
      console.error(`翻訳の取りこぼし確認に失敗しました(${target.label}):`, error.message);
      continue;
    }
    const rows = (data ?? []) as Row[];
    stat.checked = rows.length;
    const stale = rows.filter((r) => {
      const fields = target.fieldsOf(r);
      const hasText = Object.values(fields).some((v) => typeof v === "string" && v.trim());
      return hasText && needsTranslation(fields, r[target.translationsCol ?? "translations"], target.targets, hintOf(r));
    });
    stat.stale = stale.length;

    for (let i = 0; i < stale.length; i += BATCH_SIZE) {
      if (budget <= 0 || Date.now() > deadline) {
        remaining += stale.length - i;
        stoppedEarly = true;
        break;
      }
      const batch = stale.slice(i, Math.min(i + BATCH_SIZE, i + budget));
      let translated: Awaited<ReturnType<typeof translateFieldsBatch>>;
      try {
        translated = await translateFieldsBatch(batch.map((r) => target.fieldsOf(r)), target.targets, batch.map(hintOf));
      } catch (e) {
        console.error(`翻訳に失敗しました(${target.label}):`, e);
        stat.failed += batch.length;
        budget -= batch.length;
        continue;
      }
      for (let j = 0; j < batch.length; j += 1) {
        // 人が手直しした訳は、原文が変わっても上書きしない。
        const result = preserveManualTranslations(translated[j], batch[j][target.translationsCol ?? "translations"]);
        if (!result) {
          stat.failed += 1;
          continue;
        }
        let uq = db.from(target.table).update({ [target.translationsCol ?? "translations"]: result as unknown as Json });
        for (const c of target.idCols ?? ["id"]) uq = uq.eq(c, batch[j][c]);
        const { error: upErr } = await uq;
        if (upErr) stat.failed += 1;
        else stat.translated += 1;
      }
      budget -= batch.length;
    }
  }

  // 住所の英語表記(address_en)が無い店舗の分。住所は日本語のままだと、英語表示でも日本語の住所が出てしまう。
  const addrStat = { checked: 0, stale: 0, translated: 0, failed: 0 };
  results.address_en = addrStat;
  let aq = db.from("locapass_shops").select("id, address").eq("status", "active").is("address_en", null).not("address", "is", null);
  if (opts.shopId) aq = aq.eq("id", opts.shopId);
  const { data: addrRows } = await aq;
  const needAddr = ((addrRows ?? []) as { id: string; address: string }[]).filter((r) => r.address.trim());
  addrStat.checked = addrRows?.length ?? 0;
  addrStat.stale = needAddr.length;
  for (let i = 0; i < needAddr.length; i += 20) {
    if (Date.now() > deadline) {
      remaining += needAddr.length - i;
      stoppedEarly = true;
      break;
    }
    const batch = needAddr.slice(i, i + 20);
    try {
      const en = await translateAddressesToEnglish(batch.map((r) => r.address));
      for (let j = 0; j < batch.length; j += 1) {
        const v = en[j];
        if (!v) {
          addrStat.failed += 1;
          continue;
        }
        const { error: upErr } = await db.from("locapass_shops").update({ address_en: v }).eq("id", batch[j].id);
        if (upErr) addrStat.failed += 1;
        else addrStat.translated += 1;
      }
    } catch (e) {
      console.error("住所の英語表記の作成に失敗しました:", e);
      addrStat.failed += batch.length;
    }
  }

  return { results, remaining, stoppedEarly };
}
