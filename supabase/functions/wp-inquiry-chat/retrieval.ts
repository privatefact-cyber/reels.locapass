// コンシェルジュAIに渡す店舗資料を「質問に関係する店だけ」に絞る。
// 店舗数が増えても、AIが読む量(=返信の速さ・費用)を一定にするのが目的。
// 絞り込みに失敗したり、検索用データがまだ無いときは、従来どおり(絞らない)で動く。
import { createClient } from "jsr:@supabase/supabase-js@2";

type Doc = { title: string; url: string; content: string };
type Db = ReturnType<typeof createClient>;

type Settings = {
  w_sem: number;
  w_kw: number;
  w_fresh: number;
  w_paid: number;
  prompt_limit: number;
  small_site_limit: number;
};

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;

export async function embedText(text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"): Promise<number[] | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBED_DIM,
        }),
      },
    );
    if (!res.ok) {
      console.error("embed failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const v = data?.embedding?.values;
    return Array.isArray(v) ? (v as number[]) : null;
  } catch (err) {
    console.error("embed error", err);
    return null;
  }
}

// 質問から、店名・ジャンル・住所に部分一致させるキーワードを取り出す(日本語は分かち書きできないので、助詞や句読点で区切る)。
export function extractTerms(...texts: string[]): string[] {
  const stop = new Set(["おすすめ", "教えて", "ください", "ありますか", "ある", "いい", "良い", "お店", "店", "場所", "どこ", "ところ", "知りたい", "行きたい", "したい", "ですか", "ます", "です"]);
  const out: string[] = [];
  for (const text of texts) {
    const segments = text
      .replace(/[「」『』【】\[\]()（）、。,.!?！？~〜…・:：;；"'`]/gu, " ")
      .split(/\s+|(?:って|という|とか|から|まで|より|について|には|では|とは|を|が|は|に|で|の|と|も|や|へ|て)/u);
    for (const s of segments) {
      const t = s.trim();
      if (t.length >= 2 && t.length <= 20 && !stop.has(t) && !out.includes(t)) out.push(t);
    }
  }
  return out.slice(0, 8);
}

async function loadSettings(db: Db): Promise<Settings> {
  const { data } = await db.from("concierge_settings").select("*").eq("id", true).maybeSingle();
  const s = (data ?? {}) as Partial<Settings>;
  return {
    w_sem: s.w_sem ?? 1,
    w_kw: s.w_kw ?? 0.35,
    w_fresh: s.w_fresh ?? 0.15,
    w_paid: s.w_paid ?? 0.15,
    prompt_limit: s.prompt_limit ?? 40,
    small_site_limit: s.small_site_limit ?? 80,
  };
}

export type NarrowInput = {
  db: Db; // wp_inquiry スキーマのクライアント
  kbDocs: Doc[]; // すでに「近さ・エリア・選択タグ・噂」で並べ替え済みの全店舗
  protectedCount: number; // 先頭から、必ず残す件数(★付き・噂ネタ・求人の噂があるもの)
  message: string;
  recentUserTexts: string[]; // 直前までのユーザー発言(新しい順)。「じゃあそこは?」のような続きの質問に使う
  recentAiTexts: string[]; // 直前までのAIの返信(新しい順)。直前に紹介した店を残す
  scopeKey: string; // 'locapass' / 'kb:<site_id>'
  portalId: number | null;
  selectedKeyword: string;
};

export type NarrowResult = { docs: Doc[]; note: string; narrowed: boolean };

const HEAD_COUNT = 12; // 並べ替え済みの先頭(近い店・閲覧中エリアの店)は、検索結果と関係なく残す
const SEARCH_COUNT = 30;
const PER_GENRE = 3;
const MAX_UNINDEXED = 10; // 索引前の新店を資料に足す上限
const MAX_INDEX_URL_PAGES = 10; // 索引済みURLの読み込み上限(1000件×10ページ)。超えたらこの機能は使わない

export async function narrowKbDocs(input: NarrowInput): Promise<NarrowResult> {
  const { db, kbDocs, message } = input;
  const unchanged: NarrowResult = { docs: kbDocs, note: "", narrowed: false };
  try {
    const settings = await loadSettings(db);
    if (kbDocs.length <= settings.small_site_limit) return unchanged;

    // 検索用データがまだ無いサイト(未索引)は、絞らない。
    const { count } = await db
      .from("shop_index")
      .select("id", { count: "exact", head: true })
      .eq("scope_key", input.scopeKey)
      .not("embedding", "is", null);
    if (!count || count < 1) return unchanged;

    const context = message.trim().length < 12 ? [message, ...input.recentUserTexts.slice(0, 2)] : [message];
    const queryText = context.join("\n").slice(0, 600);
    const embedding = await embedText(queryText, "RETRIEVAL_QUERY");
    const terms = extractTerms(message, input.selectedKeyword, ...(message.trim().length < 12 ? input.recentUserTexts.slice(0, 1) : []));

    const byUrl = new Map(kbDocs.map((d) => [d.url, d]));
    const picked: Doc[] = [];
    const seen = new Set<string>();
    const add = (url: string | undefined | null) => {
      if (!url || seen.has(url)) return;
      const d = byUrl.get(url);
      if (!d) return;
      seen.add(url);
      picked.push(d);
    };

    // 1. 必ず残すもの: ★付き・噂ネタなど、先に判定済みの店 + 並べ替え済みの先頭
    kbDocs.slice(0, Math.min(input.protectedCount, 30)).forEach((d) => add(d.url));
    kbDocs.slice(0, HEAD_COUNT).forEach((d) => add(d.url));

    // 1.5 まだ索引に載っていない新しい店(定期更新の前)。検索では拾えないので、少数だけ必ず入れる。
    const indexedUrls = new Set<string>();
    let indexComplete = true;
    for (let from = 0, page = 0; ; from += 1000, page++) {
      if (page >= MAX_INDEX_URL_PAGES) {
        indexComplete = false;
        break;
      }
      const { data: rows, error: pageError } = await db
        .from("shop_index")
        .select("url")
        .eq("scope_key", input.scopeKey)
        .range(from, from + 999);
      if (pageError) {
        indexComplete = false;
        break;
      }
      for (const r of rows ?? []) indexedUrls.add((r as { url: string }).url);
      if (!rows || rows.length < 1000) break;
    }
    if (indexComplete) {
      // 索引に無い資料のうち、公開中の店だけを対象にする(非公開の店や店以外のページは、索引されないので毎回枠を取ってしまう)。
      const uuidRe = /\/shops\/([0-9a-fA-F-]{36})/;
      const candidates = kbDocs
        .filter((d) => !indexedUrls.has(d.url) && !seen.has(d.url))
        .map((d) => ({ d, id: d.url.match(uuidRe)?.[1] }))
        .filter((x): x is { d: Doc; id: string } => Boolean(x.id))
        .slice(0, 60);
      if (candidates.length > 0) {
        const table = input.scopeKey === "locapass" ? "locapass_shops" : "shops";
        const { data: active, error: activeError } = await db
          .schema("public")
          .from(table)
          .select("id")
          .in("id", candidates.map((x) => x.id))
          .eq("status", "active");
        if (activeError) console.error("unindexed shops lookup failed", activeError);
        const activeIds = new Set(((active ?? []) as { id: string }[]).map((r) => r.id));
        let added = 0;
        for (const x of candidates) {
          if (added >= MAX_UNINDEXED) break;
          if (activeIds.has(x.id)) {
            add(x.d.url);
            added++;
          }
        }
      }
    }

    // 2. 直前の返信で紹介した店(続きの質問で消えないように)
    for (const ai of input.recentAiTexts.slice(0, 2)) {
      for (const d of kbDocs) {
        const bare = d.title.replace(/^[\[［【].*?[\]］】]\s*/u, "").trim();
        if (bare.length >= 2 && ai.includes(bare)) add(d.url);
      }
    }

    // 3. 質問に合う店(意味の近さ + キーワード + 新しさ + 有料)
    if (embedding || terms.length > 0) {
      const { data: found, error } = await db.rpc("search_shop_index", {
        p_scope: input.scopeKey,
        p_embedding: embedding ? JSON.stringify(embedding) : null,
        p_terms: terms,
        p_portal_id: input.portalId,
        p_limit: SEARCH_COUNT,
      });
      if (error) console.error("search_shop_index failed", error);
      for (const r of (found ?? []) as { url: string }[]) add(r.url);
    }

    // 4. どんな質問でも、いろいろなジャンルの店が資料に入るように、ジャンルごとの上位を足す
    const { data: diverse, error: diverseError } = await db.rpc("diverse_shop_index", {
      p_scope: input.scopeKey,
      p_portal_id: input.portalId,
      p_per_genre: PER_GENRE,
    });
    if (diverseError) console.error("diverse_shop_index failed", diverseError);
    for (const r of (diverse ?? []) as { url: string }[]) add(r.url);

    // 検索結果が空(埋め込みも関数も失敗)なら、絞らず従来どおり。
    if (picked.length <= HEAD_COUNT && !embedding && terms.length === 0) return unchanged;

    const limit = Math.max(settings.prompt_limit, Math.min(input.protectedCount, 30));
    const docs = picked.slice(0, limit);
    const note =
      `【システム情報: 店舗資料について】以下の店舗資料は、全${kbDocs.length}店舗のうち、質問に関係が深そうな${docs.length}店舗の抜粋です。` +
      `載っていない店舗も登録されています。資料の中に条件に合う店が見つからなくても、「登録されていません」と断定せず、` +
      `「いま手元の候補には見当たりませんでした。エリアやジャンル、キーワードを変えて探してみてください」のように案内してください。\n\n`;
    console.log(`narrowed kb ${kbDocs.length} -> ${docs.length} (terms=${terms.join("|")}, embedded=${Boolean(embedding)})`);
    return { docs, note, narrowed: true };
  } catch (err) {
    console.error("narrowKbDocs failed; using all docs", err);
    return unchanged;
  }
}
