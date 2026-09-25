/**
 * 街の声: 1店舗分の「収集 → 蒸留 → 安全網 → 保存」パイプライン。
 * CLI(scripts/sync-street-whispers.ts)とオンデマンドAPI(app/api/shops/[id]/sync-whisper)の両方から使う。
 * LUXELA(~/Downloads/modella)と locapass(~/Downloads/reels.locapass)で同じファイルを置き、SITE だけ切り替える。
 *
 * 費用の考え方(2026-09時点):
 *   Google検索グラウンディングは1日1,500回まで無料、超えると $35/1,000回。トークン代は1店あたり1円前後。
 *   → 1店舗は「最後に調べてから REFRESH_DAYS 日」経つまで調べ直さない(情報が無かった店も含む。空振りループ防止)。
 *      判定には sns_whisper_checked_at(結果の有無に関わらず調べた日時)を使う。
 *   → 1日の実行回数を DAILY_CAP(両サイト合計、既定100件)で打ち止めにする(課金事故防止のサーキットブレーカー)。
 *   → 収集(検索)は Flash、蒸留は安い Flash-Lite。どちらも出力を短くしてトークン代を抑える。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type WhisperSite = "luxela" | "locapass";

/** 収集(Google検索グラウンディング)用。 */
const COLLECT_MODEL = "gemini-2.5-flash";
/** 蒸留(検索なしのJSON判定)用。安いモデルで十分。 */
const DISTILL_MODEL = "gemini-2.5-flash-lite";
/** 最後に調べてからこの日数が経つまでは調べ直さない(--force/管理者の強制更新を除く)。 */
export const REFRESH_DAYS = Number(process.env.STREET_WHISPER_REFRESH_DAYS ?? 3);
/**
 * 1日(日本時間)の収集回数の上限(サーキットブレーカー)。環境変数 DAILY_WHISPER_UPDATE_LIMIT で変更できる。
 * LUXELAとlocapassは同じGeminiキー(=同じ無料枠)なので両サイト合計で数える。
 * 初期は安全のため100件。グラウンディングの無料枠(1,500回/日)に収めるなら1,400件程度まで上げられる。
 */
export const DAILY_CAP = Number(process.env.DAILY_WHISPER_UPDATE_LIMIT ?? 100);
/** DBの check 制約(200文字)に収める。 */
const MAX_WHISPER_CHARS = 200;
const LOG_TABLES = ["shop_street_investigations", "locapass_shop_street_investigations"] as const;

const SITES = {
  luxela: {
    shopTable: "shops",
    logTable: "shop_street_investigations",
    categoryColumn: "genre",
    categoryLabel: "業態",
    analyst: "夜の街の一流コンシェルジュ専属のチーフアナリスト",
    charms: "キャストの評判、VIPの居心地、内装、直近の盛り上がり、イベント、客層の良さ",
    searchTopics: "評判 OR 口コミ OR 混雑 OR キャスト OR 話題 OR イベント",
    announceTopics: "周年、新人・復帰、リニューアルなど",
  },
  locapass: {
    shopTable: "locapass_shops",
    logTable: "locapass_shop_street_investigations",
    categoryColumn: "category",
    categoryLabel: "業種",
    analyst: "街のお店に詳しい一流コンシェルジュ専属のチーフアナリスト",
    charms: "看板メニュー・名物、店の雰囲気、内装、スタッフの評判、直近の話題やイベント、限定品、賑わい",
    searchTopics: "評判 OR 口コミ OR 混雑 OR 人気メニュー OR 話題 OR イベント",
    announceTopics: "新メニュー、限定品、周年、リニューアルなど",
  },
} as const;

/**
 * 客向けテキストに1文字でも入っていたら不採用にする語。LLMの指示だけに頼らず、コード側で最終的に弾く。
 * (閉店・停止の判定は is_closed 側で扱うので、耳打ちには出さない)
 */
/**
 * 働く側(求人)目線の語。噂ネタは「遊びに行くお客様」向けなので、これが入った文も不採用にする
 * (ネタ元に求人サイトが多く、「採用基準が高い」「キャスト同士の仲が良い」のような文が混ざるため)。
 */
const RECRUIT_WORDS = /採用|求人|面接|時給|日給|月給|体入|体験入店|入店祝|日払|バック|保証|送り|寮|未経験|応募|働きやす|働く|キャスト同士|育成|育てる/u;

const NEGATIVE_WORDS =
  /警察|逮捕|摘発|検挙|事件|反社|暴力団|政治|議員|献金|トラブル|ぼったくり|ボッタクリ|営業停止|行政処分|休業|閉店|閉業|撤退|違法|詐欺|容疑|送検|風営法違反|被害|炎上|クレーム|悪評|最悪|危険|民度|ノルマ/u;

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type Source = { title: string; uri: string };

export type Verdict = {
  is_closed: boolean;
  closed_evidence: string | null;
  whisper_text: string | null;
  summary_reason: string;
};

export type ShopRow = {
  id: string;
  name: string;
  area: string | null;
  category: string | null;
  address: string | null;
  sns_links: unknown;
  sns_whisper: string | null;
  sns_whisper_source: string | null;
  sns_whisper_checked_at: string | null;
  is_temporarily_closed: boolean;
};

export type SyncResult =
  | { status: "fresh"; whisper: string | null; checkedAt: string | null }
  | { status: "capped"; whisper: string | null; usedToday: number }
  | { status: "not_found" }
  | {
      status: "updated";
      whisper: string | null;
      verdict: Verdict;
      rejected?: string;
      keptManual: boolean;
      raw: string;
      sources: Source[];
      queries: string[];
      dryRun: boolean;
    }
  | { status: "failed"; error: string; whisper: string | null };

export function shopSelectColumns(site: WhisperSite): string {
  const c = SITES[site].categoryColumn;
  return `id, name, area, category:${c}, address, sns_links, sns_whisper, sns_whisper_source, sns_whisper_checked_at, is_temporarily_closed`;
}

function todayJst(): string {
  return new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

/** 日本時間の今日0時(UTCのISO文字列)。 */
function jstMidnightIso(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600_000);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - 9 * 3600_000).toISOString();
}

export function isFresh(checkedAt: string | null, now = Date.now()): boolean {
  return Boolean(checkedAt) && now - new Date(checkedAt as string).getTime() < REFRESH_DAYS * 86400_000;
}

/** 今日(日本時間)の収集回数(両サイト合計)。 */
export async function countTodayRuns(supabase: AnyClient): Promise<number> {
  const since = jstMidnightIso();
  let total = 0;
  for (const table of LOG_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if (error) throw new Error(`今日の収集回数の取得に失敗(${table}): ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

function instagramOf(snsLinks: unknown): string | null {
  if (!snsLinks || typeof snsLinks !== "object" || Array.isArray(snsLinks)) return null;
  const v = (snsLinks as Record<string, unknown>).instagram;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function shopIdentity(site: WhisperSite, shop: ShopRow): string {
  const instagram = instagramOf(shop.sns_links);
  return [
    `店名: ${shop.name}`,
    shop.category ? `${SITES[site].categoryLabel}: ${shop.category}` : null,
    shop.area ? `エリア: ${shop.area}` : null,
    shop.address ? `住所: ${shop.address}` : null,
    instagram ? `公式Instagram: ${instagram}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// deno-lint-ignore no-explicit-any
async function callGemini(model: string, body: unknown): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** 1. 収集: 良い話も悪い話も区別せず、検索で見つかった情報を短い箇条書きで集める。 */
async function investigate(site: WhisperSite, shop: ShopRow) {
  const cfg = SITES[site];
  const prompt = `あなたは調査員です。今日は${todayJst()}です。次の店舗について、Google検索でWeb・SNS(Instagram・X・ブログ・口コミサイト・ニュース)上の情報を集めてください。良い話も悪い話(事件・摘発・閉店・トラブル・悪評)も区別せず拾うこと。

【対象店舗】
${shopIdentity(site, shop)}

【検索の例】
- "${shop.name}" ${shop.area ?? ""} (${cfg.searchTopics})
- "${shop.name}" ${shop.area ?? ""} (閉店 OR 摘発 OR 逮捕 OR 営業停止 OR トラブル)
- "${shop.name}" Instagram / X での直近の告知(${cfg.announceTopics})

検索は多くても4回まで。深追いせず素早く済ませること(速さ優先。多少の取りこぼしは構わない)。

出力: 見つけた情報を最大8件、1行1件の箇条書きで。各行は「日付(分かれば)・媒体名・内容」を60文字以内で短く。
新しい情報を優先。同名の別店舗(別の地域・別業態)の情報は除く。推測は書かない。何も見つからなければ「情報なし」とだけ書く。`;

  const data = await callGemini(COLLECT_MODEL, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    // 考える時間を0にし、検索回数・出力も絞る(無制限だと1店舗で検索170回・165秒かかった。絞ると約8秒)。
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  });
  const candidate = data?.candidates?.[0];
  const raw: string = (candidate?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  const meta = candidate?.groundingMetadata ?? {};
  const sources: Source[] = (meta.groundingChunks ?? [])
    .map((c: { web?: { title?: string; uri?: string } }) => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" }))
    .filter((s: Source) => s.uri);
  return { raw, sources, queries: (meta.webSearchQueries ?? []) as string[] };
}

/** 2. 蒸留: 生データから客向けのポジティブなネタと営業実態を判定する(検索なし・JSON出力)。 */
async function distill(site: WhisperSite, shop: ShopRow, raw: string): Promise<Verdict> {
  const cfg = SITES[site];
  const prompt = `あなたは${cfg.analyst}です。
Web・SNSから収集された生データを精査し、「お客様向けの魅力的な耳打ちネタ」と「店舗の営業実態」を判定してください。

【今日の日付】${todayJst()}(これより前の日付の閉店・停止告知は既に発生済みとして扱う)
【対象店舗】
${shopIdentity(site, shop)}

【厳格なフィルタリングルール】
1. whisper_text(客向けネタ)のルール:
 - 警察、逮捕、摘発、事件、反社、トラブル、ぼったくり、閉店、営業停止、ノルマ、客層・民度への懸念、個人の誹謗中傷などのネガティブ要素は1文字たりとも含めない(ほのめかしも禁止)。
 - ${cfg.charms}など、客の来店意欲をそそるポジティブな魅力だけを抽出する。一番おいしいネタ1〜2個に絞る。
 - 働く側(求人)目線の情報は一切使わない。時給・日払い・体入・送り・寮などの条件はもちろん、「採用基準が高い」「面接」「キャスト同士の仲が良い」「働きやすい」「スターを育てる」「未経験歓迎」のような、働く人向けの話も入れない。
 - 遊びに行くお客様が「行ってみたい」と思う話(店の雰囲気、内装、お酒や料理、イベント、話題の人、賑わい、客層の良さなど)だけにする。
 - 生データに書かれていることだけを使い、推測で足さない。同名の別店舗の情報は使わない。
 - 中立な事実の要約文で、「〜との声がある」「〜という話題が見られる」のような伝聞・観測の形。必ず60〜100文字に収める。
 - ポジティブな話題が皆無、またはノイズしかない場合は null。
2. is_closed の判定:
 - 「現在進行形で摘発・営業停止処分を受け営業していない」「閉店・撤退した」という明確な報道・事実がある場合のみ true。単なるネットの噂、過去の事件(その後営業している)、移転・改装は false。
 - true のときは closed_evidence に根拠(媒体・日付)を短く書く。false なら null。
3. summary_reason: 運営確認用のメモを60文字以内で。ネガティブ情報があった場合はその要点もここに書く(客には出ない)。

出力はJSONのみ: {"is_closed": boolean, "closed_evidence": string|null, "whisper_text": string|null, "summary_reason": string}

【生データ】
${raw}`;

  const data = await callGemini(DISTILL_MODEL, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = JSON.parse(text) as Partial<Verdict>;
  return {
    is_closed: parsed.is_closed === true,
    closed_evidence: typeof parsed.closed_evidence === "string" ? parsed.closed_evidence : null,
    whisper_text:
      typeof parsed.whisper_text === "string" && parsed.whisper_text.trim() ? parsed.whisper_text.trim() : null,
    summary_reason: typeof parsed.summary_reason === "string" ? parsed.summary_reason : "",
  };
}

/** 200文字を超えたら、収まる範囲の最後の句点で切る。 */
function fitLength(text: string): string {
  // 文全体がかぎかっこ等で囲まれているときだけ外す(「梅里豚」を…のような文頭のかっこは残す)。
  const cleaned = text
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^["「『]([^"「」『』]*)["」』]$/u, "$1");
  if (cleaned.length <= MAX_WHISPER_CHARS) return cleaned;
  const head = cleaned.slice(0, MAX_WHISPER_CHARS);
  const cut = head.lastIndexOf("。");
  return cut >= 60 ? head.slice(0, cut + 1) : head.slice(0, MAX_WHISPER_CHARS - 1) + "…";
}

/** 3. 安全網: 客に出してよい耳打ち文だけを返す(ダメなら null と理由)。 */
function safeWhisper(verdict: Verdict, sourceCount: number): { text: string | null; rejected?: string } {
  if (!verdict.whisper_text) return { text: null };
  if (verdict.is_closed) return { text: null, rejected: "閉店・営業停止判定のため耳打ちしない" };
  if (sourceCount === 0) return { text: null, rejected: "検索の根拠が無いため不採用" };
  const hit = verdict.whisper_text.match(NEGATIVE_WORDS)?.[0];
  if (hit) return { text: null, rejected: `ネガティブ語「${hit}」を含むため不採用` };
  const recruit = verdict.whisper_text.match(RECRUIT_WORDS)?.[0];
  if (recruit) return { text: null, rejected: `働く側の話「${recruit}」を含むため不採用` };
  return { text: fitLength(verdict.whisper_text) };
}

/**
 * 1店舗だけ「収集 → 蒸留 → 安全網 → 保存」する。
 *   force=false : 最後に調べてから REFRESH_DAYS 日以内ならスキップ(既存の噂を返す)。1日の上限に達していてもスキップ。
 *   force=true  : 日数・上限・手入力(manual)を無視して調べ直す(管理者・CLIの --force 用)。
 *   dryRun=true : 調べるだけでDBには書かない。
 * 同じ店舗への同時実行は、sns_whisper_checked_at を先に条件付きで打つ「予約」で1本に絞る。
 */
export async function syncSingleShopWhisper(
  supabase: AnyClient,
  site: WhisperSite,
  shopOrId: string | ShopRow,
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<SyncResult> {
  const { force = false, dryRun = false } = opts;
  const cfg = SITES[site];

  let shop: ShopRow;
  if (typeof shopOrId === "string") {
    const { data, error } = await supabase.from(cfg.shopTable).select(shopSelectColumns(site)).eq("id", shopOrId).maybeSingle();
    if (error) return { status: "failed", error: error.message, whisper: null };
    if (!data) return { status: "not_found" };
    shop = data as unknown as ShopRow;
  } else {
    shop = shopOrId;
  }

  if (!force && isFresh(shop.sns_whisper_checked_at)) {
    return { status: "fresh", whisper: shop.sns_whisper, checkedAt: shop.sns_whisper_checked_at };
  }

  if (!force) {
    const usedToday = await countTodayRuns(supabase);
    if (usedToday >= DAILY_CAP) return { status: "capped", whisper: shop.sns_whisper, usedToday };
  }

  const startedAt = new Date().toISOString();
  if (!dryRun) {
    // 予約: 他のリクエストが同時に同じ店舗を調べないよう、先に checked_at を打つ。
    // 条件付き(まだ新しくない場合だけ)にすることで、同時に来た2本目は0件更新になりスキップされる。
    let claim = supabase.from(cfg.shopTable).update({ sns_whisper_checked_at: startedAt }).eq("id", shop.id);
    if (!force) {
      const staleBefore = new Date(Date.now() - REFRESH_DAYS * 86400_000).toISOString();
      claim = claim.or(`sns_whisper_checked_at.is.null,sns_whisper_checked_at.lt.${staleBefore}`);
    }
    const { data: claimed, error: claimError } = await claim.select("id");
    if (claimError) return { status: "failed", error: `予約に失敗: ${claimError.message}`, whisper: shop.sns_whisper };
    if (!claimed || claimed.length === 0) {
      return { status: "fresh", whisper: shop.sns_whisper, checkedAt: shop.sns_whisper_checked_at };
    }
  }

  try {
    const { raw, sources, queries } = await investigate(site, shop);
    // 蒸留は軽いモデルなので、まれにJSONが途中で切れる・一時エラーになる。1回だけやり直す(検索はやり直さない)。
    const verdict = await distill(site, shop, raw).catch(() => distill(site, shop, raw));
    const { text: whisper, rejected } = safeWhisper(verdict, sources.length);
    const keptManual = shop.sns_whisper_source === "manual" && !force;

    if (!dryRun) {
      const { error: logError } = await supabase.from(cfg.logTable).insert({
        shop_id: shop.id,
        model: `${COLLECT_MODEL} + ${DISTILL_MODEL}`,
        search_queries: queries,
        sources,
        raw_text: raw,
        llm_result: { ...verdict, rejected: rejected ?? null },
        is_closed: verdict.is_closed,
        whisper_text: whisper,
        summary_reason: verdict.summary_reason,
      });
      if (logError) throw new Error(`調査ログの保存に失敗: ${logError.message}`);

      const update: Record<string, unknown> = {
        sns_whisper_checked_at: new Date().toISOString(),
        is_temporarily_closed: verdict.is_closed,
      };
      if (!keptManual) {
        update.sns_whisper = whisper;
        update.sns_whisper_source = whisper ? "auto" : null;
        update.sns_whisper_sources = whisper ? sources.slice(0, 10) : null;
      }
      const { data: updatedRows, error: updateError } = await supabase
        .from(cfg.shopTable)
        .update(update)
        .eq("id", shop.id)
        .select("id");
      // RLSで弾かれると0件でもエラーにならないので、件数で確かめる。
      if (updateError || !updatedRows || updatedRows.length === 0) {
        throw new Error(`店舗の更新に失敗: ${updateError?.message ?? "更新0件(権限をご確認ください)"}`);
      }
    }

    return {
      status: "updated",
      whisper: keptManual ? shop.sns_whisper : whisper,
      verdict,
      rejected,
      keptManual,
      raw,
      sources,
      queries,
      dryRun,
    };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err), whisper: shop.sns_whisper };
  }
}

/**
 * 検索はやり直さず、最新の調査ログの生データから「蒸留 → 安全網」だけやり直して噂ネタを作り直す。
 * 蒸留ルールを変えたときの一括作り直し用。Google検索を使わないので無料枠・1日上限には数えない(トークン代もごく小さい)。
 * 手入力(manual)の噂は force が無ければ上書きしない。調査ログ自体は書き換えない。
 * 営業停止・閉店の判定(is_temporarily_closed)は検索時の判定を正とし、ここでは変えない
 * (軽いモデルで判定し直すと、閉店の疑いが外れてしまうことがあったため)。フラグが立っている店は噂を出さない。
 */
export async function redistillShopWhisper(
  supabase: AnyClient,
  site: WhisperSite,
  shop: ShopRow,
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<SyncResult> {
  const { force = false, dryRun = false } = opts;
  const cfg = SITES[site];
  const { data: log, error } = await supabase
    .from(cfg.logTable)
    .select("raw_text, sources, search_queries")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { status: "failed", error: error.message, whisper: shop.sns_whisper };
  if (!log?.raw_text) return { status: "not_found" };

  try {
    const raw = log.raw_text as string;
    const sources = (Array.isArray(log.sources) ? log.sources : []) as Source[];
    const distilled = await distill(site, shop, raw).catch(() => distill(site, shop, raw));
    const verdict: Verdict = { ...distilled, is_closed: shop.is_temporarily_closed };
    const { text: whisper, rejected } = safeWhisper(verdict, sources.length);
    const keptManual = shop.sns_whisper_source === "manual" && !force;

    if (!dryRun && !keptManual) {
      const { data: updatedRows, error: updateError } = await supabase
        .from(cfg.shopTable)
        .update({
          sns_whisper: whisper,
          sns_whisper_source: whisper ? "auto" : null,
          sns_whisper_sources: whisper ? sources.slice(0, 10) : null,
        })
        .eq("id", shop.id)
        .select("id");
      if (updateError || !updatedRows || updatedRows.length === 0) {
        throw new Error(`店舗の更新に失敗: ${updateError?.message ?? "更新0件(権限をご確認ください)"}`);
      }
    }
    return {
      status: "updated",
      whisper: keptManual ? shop.sns_whisper : whisper,
      verdict,
      rejected,
      keptManual,
      raw,
      sources,
      queries: (log.search_queries ?? []) as string[],
      dryRun,
    };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err), whisper: shop.sns_whisper };
  }
}
