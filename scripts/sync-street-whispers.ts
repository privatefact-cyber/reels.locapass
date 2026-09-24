/**
 * 街の声(locapass版): 店舗ごとにWeb/SNS上の情報を「良い話も悪い話も全部」集めてDBに蓄積し、
 * そこから客向けのポジティブな魅力だけを蒸留して locapass_shops.sns_whisper に入れる一括スクリプト。
 * LUXELA(~/Downloads/modella の同名スクリプト)と同じパイプラインで、テーブルだけ locapass 用。
 * sns_whisper は、コンシェルジュの「街の声 β」タブで情報屋の語り口に毎回言い換えて耳打ちされる
 * (Edge Function wp-inquiry-chat の narrateWhispers)。
 *
 * パイプライン(1店舗ごと):
 *   1. 収集  … Gemini + Google検索グラウンディングで、評判・口コミ・イベント・閉店・摘発・トラブル等を
 *              区別せず箇条書きで集める(検索語と根拠URLも取る)。
 *   2. 蒸留  … 1の生データを別のGemini呼び出し(検索なし・JSON出力)で判定する。
 *              { is_closed, closed_evidence, whisper_text, summary_reason }
 *   3. 安全網 … whisper_text にネガティブ語(逮捕・摘発・閉店・トラブル等)が1つでも入っていたら不採用。
 *              is_closed=true の店舗は whisper_text を捨てる。
 *   4. 保存  … 生データ・検索語・根拠・判定JSONは locapass_shop_street_investigations に毎回1行追加(ポータル管理者以上のみ閲覧可)。
 *              locapass_shops には sns_whisper / sns_whisper_source='auto' / is_temporarily_closed などを反映。
 *
 * is_temporarily_closed は内部フラグ。公開ページからの自動非表示はしない(誤判定で掲載店を消さないため)。
 * 立った店舗は耳打ちを止め、運営管理画面に警告を出す。
 *
 * 使い方:
 *   npm run sync-whispers -- --dry-run --shop "JUNGLE TOKYO"   # 店名の部分一致で1店舗だけ試す(書き込まない)
 *   npm run sync-whispers -- --dry-run --id <shop uuid>        # IDで1店舗だけ試す
 *   npm run sync-whispers -- --dry-run --limit 3               # 古い順に3店舗を試す
 *   npm run sync-whispers -- --portal mito                       # ポータル(locapass_portals.slug)を指定して更新
 *   npm run sync-whispers -- --limit 20                        # 古い順に20店舗を実際に更新
 *   npm run sync-whispers                                      # 全店舗(古い順)
 *   npm run sync-whispers -- --force                           # manual(管理画面で手入力)の耳打ちも上書きする
 *   npm run sync-whispers -- --dry-run --out /tmp/w.json       # 結果をJSONに書き出す
 *   npm run sync-whispers -- --quiet                           # 生データ・判定JSONのログを省略
 *   npm run sync-whispers -- --parallel 8                        # 同時処理数を変える(既定5)
 *
 * 手入力(sns_whisper_source='manual')の店舗も調査と蓄積はする。--force が無ければ耳打ち文だけ上書きしない。
 *
 * 接続には運営権限が要る。.env.local に SUPABASE_SERVICE_ROLE_KEY か、
 * PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD を置くこと(--dry-run は anon キーだけで動く)。
 * 定期実行は、同じ環境変数を渡して cron / GitHub Actions から npm run sync-whispers -- --quiet を呼ぶ。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";
import type { Database, Json } from "../types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const GEMINI_MODEL = "gemini-2.5-flash";
/** 各ワーカーが1店舗ごとに空ける間隔(ms)。検索グラウンディングのレート制限に余裕を持たせる。 */
const REQUEST_INTERVAL_MS = 500;
/** 同時に処理する店舗数(--parallel で変更可)。 */
const DEFAULT_PARALLEL = 5;
/** DBの check 制約(200文字)に収める。 */
const MAX_WHISPER_CHARS = 200;

/**
 * 客向けテキストに1文字でも入っていたら不採用にする語。LLMの指示だけに頼らず、コード側で最終的に弾く。
 * (閉店・停止の判定は is_closed 側で扱うので、耳打ちには出さない)
 */
const NEGATIVE_WORDS =
  /警察|逮捕|摘発|検挙|事件|反社|暴力団|トラブル|ぼったくり|ボッタクリ|営業停止|行政処分|休業|閉店|閉業|撤退|違法|詐欺|容疑|送検|風営法違反|被害|炎上|クレーム|悪評|最悪|危険|民度|ノルマ/u;

type Source = { title: string; uri: string };

type Verdict = {
  is_closed: boolean;
  closed_evidence: string | null;
  whisper_text: string | null;
  summary_reason: string;
};

type Shop = {
  id: string;
  name: string;
  area: string | null;
  category: string | null;
  address: string | null;
  sns_links: Json;
  sns_whisper: string | null;
  sns_whisper_source: string | null;
  is_temporarily_closed: boolean;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const limit = valueOf("--limit");
  const parallel = valueOf("--parallel");
  return {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    quiet: args.includes("--quiet"),
    limit: limit ? Number(limit) : undefined,
    parallel: parallel ? Number(parallel) : DEFAULT_PARALLEL,
    shop: valueOf("--shop"),
    portal: valueOf("--portal"),
    id: valueOf("--id"),
    out: valueOf("--out"),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayJst(): string {
  return new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

/** geocode-shops.ts と同じ接続方法(運営権限、dry-runはanonで可)。 */
async function connect(readOnly: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    console.error(".env.local に NEXT_PUBLIC_SUPABASE_URL が必要です");
    process.exit(1);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) return createClient<Database>(url, serviceKey);

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (readOnly && anonKey) return createClient<Database>(url, anonKey);

  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!anonKey || !email || !password) {
    console.error(
      ".env.local に SUPABASE_SERVICE_ROLE_KEY、もしくは " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY + PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD が必要です",
    );
    process.exit(1);
  }

  const supabase = createClient<Database>(url, anonKey);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`運営者アカウントのログインに失敗しました: ${error.message}`);
    process.exit(1);
  }
  return supabase;
}

function instagramOf(snsLinks: Json): string | null {
  if (!snsLinks || typeof snsLinks !== "object" || Array.isArray(snsLinks)) return null;
  const v = snsLinks.instagram;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function shopIdentity(shop: Shop): string {
  const instagram = instagramOf(shop.sns_links);
  return [
    `店名: ${shop.name}`,
    shop.category ? `業種: ${shop.category}` : null,
    shop.area ? `エリア: ${shop.area}` : null,
    shop.address ? `住所: ${shop.address}` : null,
    instagram ? `公式Instagram: ${instagram}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callGemini(body: unknown): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error(".env.local に GEMINI_API_KEY が必要です");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** 1. 収集: 良い話も悪い話も区別せず、検索で見つかった情報を全部箇条書きにする。 */
async function investigate(shop: Shop): Promise<{ raw: string; sources: Source[]; queries: string[] }> {
  const prompt = `あなたは調査員です。今日は${todayJst()}です。次の店舗について、Google検索でWeb・SNS(Instagram・X・ブログ・口コミサイト・ニュース)上の情報をできるだけ幅広く集めてください。良い話も悪い話(事件・摘発・閉店・トラブル・悪評)も区別せず、全部拾うこと。

【対象店舗】
${shopIdentity(shop)}

【検索の例】
- "${shop.name}" ${shop.area ?? ""} (評判 OR 口コミ OR 混雑 OR 人気メニュー OR 話題 OR イベント)
- "${shop.name}" ${shop.area ?? ""} (閉店 OR 摘発 OR 逮捕 OR 営業停止 OR トラブル)
- "${shop.name}" Instagram / X での直近の告知(新メニュー、限定品、周年、リニューアルなど)

検索は多くても4回まで。深追いせず素早く済ませること(速さ優先。多少の取りこぼしは構わない)。

出力: 見つけた情報を1行1件の箇条書きで。各行に「日付(分かれば)・媒体/サイト名・内容」を書く。
同名の別店舗(別の地域・別業態)の情報は除く。推測は書かない。何も見つからなければ「情報なし」とだけ書く。`;

  const data = await callGemini({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    // 考える時間を0にし、検索回数も絞る(無制限だと1店舗で検索170回・165秒かかった。絞ると約8秒)。
    generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
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
  return { raw, sources, queries: meta.webSearchQueries ?? [] };
}

/** 2. 蒸留: 生データから客向けのポジティブなネタと営業実態を判定する(検索なし・JSON出力)。 */
async function distill(shop: Shop, raw: string): Promise<Verdict> {
  const prompt = `あなたは街のお店に詳しい一流コンシェルジュ専属のチーフアナリストです。
Web・SNSから収集された生データを精査し、「お客様向けの魅力的な耳打ちネタ」と「店舗の営業実態」を判定してください。

【今日の日付】${todayJst()}(これより前の日付の閉店・停止告知は既に発生済みとして扱う)
【対象店舗】
${shopIdentity(shop)}

【厳格なフィルタリングルール】
1. whisper_text(客向けネタ)のルール:
 - 警察、逮捕、摘発、事件、反社、トラブル、ぼったくり、閉店、営業停止、ノルマ、客層・民度への懸念、個人の誹謗中傷などのネガティブ要素は1文字たりとも含めない(ほのめかしも禁止)。
 - 看板メニュー・名物、店の雰囲気、内装、スタッフの評判、直近の話題やイベント、限定品、賑わいなど、客の来店意欲をそそるポジティブな魅力だけを抽出する。新しい話題を優先する。
 - 求人情報(時給・日払い・体入など働く側の条件)は使わない。お客様目線の魅力だけにする。
 - 生データに書かれていることだけを使い、推測で足さない。同名の別店舗の情報は使わない。
 - 中立な事実の要約文で書く(口調づけは表示時に別の仕組みで行う)。「〜との声がある」「〜という話題が見られる」のような伝聞・観測の形。必ず100〜150文字に収める。
 - ポジティブな話題が皆無、またはノイズしかない場合は null。
2. is_closed の判定:
 - 「現在進行形で摘発・営業停止処分を受け営業していない」「閉店・撤退した」という明確な報道・事実がある場合のみ true。単なるネットの噂、過去の事件(その後営業している)、移転・改装は false。
 - true のときは closed_evidence に根拠(媒体・日付)を書く。false なら null。
3. summary_reason: 運営確認用の短いメモ。ネガティブ情報があった場合はその要点もここに書く(客には出ない)。

出力はJSONのみ: {"is_closed": boolean, "closed_evidence": string|null, "whisper_text": string|null, "summary_reason": string}

【生データ】
${raw}`;

  const data = await callGemini({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
  });
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = JSON.parse(text) as Partial<Verdict>;
  return {
    is_closed: parsed.is_closed === true,
    closed_evidence: typeof parsed.closed_evidence === "string" ? parsed.closed_evidence : null,
    whisper_text: typeof parsed.whisper_text === "string" && parsed.whisper_text.trim() ? parsed.whisper_text.trim() : null,
    summary_reason: typeof parsed.summary_reason === "string" ? parsed.summary_reason : "",
  };
}

/** 200文字を超えたら、収まる範囲の最後の句点で切る。 */
function fitLength(text: string): string {
  const cleaned = text.replace(/^["「『]|["」』]$/gu, "").replace(/\s+/gu, " ").trim();
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
  return { text: fitLength(verdict.whisper_text) };
}

async function main() {
  const { dryRun, force, quiet, limit, parallel, shop: shopFilter, portal, id, out } = parseArgs();
  const supabase = await connect(dryRun);

  let query = supabase
    .from("locapass_shops")
    .select(
      "id, name, area, category, address, sns_links, sns_whisper, sns_whisper_source, is_temporarily_closed, sns_whisper_checked_at",
    )
    .eq("status", "active")
    .order("sns_whisper_checked_at", { ascending: true, nullsFirst: true })
    .order("name");
  if (id) query = query.eq("id", id);
  if (shopFilter) query = query.ilike("name", `%${shopFilter}%`);
  if (portal) {
    const { data: portalRow } = await supabase.from("locapass_portals").select("id").eq("slug", portal).maybeSingle();
    if (!portalRow) {
      console.error(`ポータル「${portal}」が見つかりません(locapass_portals.slug)`);
      process.exit(1);
    }
    query = query.eq("portal_id", portalRow.id);
  }

  const { data: shops, error } = await query;
  if (error) {
    console.error("店舗の取得に失敗しました:", error.message);
    process.exit(1);
  }

  const targets = (shops ?? []).slice(0, limit) as Shop[];
  console.log(
    `対象: ${targets.length}件 (同時${parallel}店)${dryRun ? " (dry-run: 書き込みません)" : ""}${force ? " (force: manualの耳打ちも上書き)" : ""}`,
  );

  const results: unknown[] = [];
  const counts = { whisper: 0, none: 0, closed: 0, rejected: 0, failed: 0 };

  // 並列処理でログが混ざらないよう、1店舗分のログをためてまとめて出す。
  async function processShop(shop: Shop, i: number) {
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);
    log(`\n[${i + 1}/${targets.length}] ${shop.name}`);
    try {
      const { raw, sources, queries } = await investigate(shop);
      if (!quiet) {
        log(`  検索語: ${queries.join(" | ") || "(なし)"}`);
        log(`  根拠: ${sources.map((s) => s.title).join(", ") || "(なし)"}`);
        log(`  ── 収集した生テキスト ──\n${raw.replace(/^/gmu, "  │ ")}`);
      }

      const verdict = await distill(shop, raw);
      if (!quiet) log(`  ── LLMの判定JSON ──\n  ${JSON.stringify(verdict)}`);

      const { text: whisper, rejected } = safeWhisper(verdict, sources.length);
      const keepManual = shop.sns_whisper_source === "manual" && !force;

      if (verdict.is_closed) counts.closed += 1;
      if (rejected) counts.rejected += 1;
      if (whisper) counts.whisper += 1;
      else counts.none += 1;

      let action: string;
      if (keepManual) action = "耳打ちは手入力を維持";
      else if (whisper) action = `耳打ちを更新: ${whisper}`;
      else action = shop.sns_whisper ? "耳打ちを削除(ネタなし)" : "耳打ちなし";
      const closedNote = verdict.is_closed
        ? ` / ⚠ 営業停止・閉店の疑い(${verdict.closed_evidence ?? "根拠不明"})`
        : shop.is_temporarily_closed
          ? " / 営業停止フラグを解除"
          : "";

      if (!dryRun) {
        const now = new Date().toISOString();
        const { error: logError } = await supabase.from("locapass_shop_street_investigations").insert({
          shop_id: shop.id,
          model: GEMINI_MODEL,
          search_queries: queries,
          sources: sources as unknown as Json,
          raw_text: raw,
          llm_result: { ...verdict, rejected: rejected ?? null } as unknown as Json,
          is_closed: verdict.is_closed,
          whisper_text: whisper,
          summary_reason: verdict.summary_reason,
        });
        if (logError) throw new Error(`調査ログの保存に失敗: ${logError.message}`);

        const update: Database["public"]["Tables"]["locapass_shops"]["Update"] = {
          sns_whisper_checked_at: now,
          is_temporarily_closed: verdict.is_closed,
        };
        if (!keepManual) {
          update.sns_whisper = whisper;
          update.sns_whisper_source = whisper ? "auto" : null;
          update.sns_whisper_sources = whisper ? (sources.slice(0, 10) as unknown as Json) : null;
        }
        const { data: updatedRows, error: updateError } = await supabase
          .from("locapass_shops")
          .update(update)
          .eq("id", shop.id)
          .select("id");
        // RLSで弾かれると0件でもエラーにならないので、件数で確かめる。
        if (updateError || !updatedRows || updatedRows.length === 0) {
          throw new Error(`店舗の更新に失敗: ${updateError?.message ?? "更新0件(権限をご確認ください)"}`);
        }
      }

      log(
        `  ── 更新結果${dryRun ? "(dry-run・未保存)" : ""} ──\n  ${action}${closedNote}${rejected ? ` / ${rejected}` : ""}`,
      );
      results.push({ id: shop.id, name: shop.name, queries, sources, raw, verdict, whisper, rejected, action });
    } catch (err) {
      counts.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      results.push({ id: shop.id, name: shop.name, error: message });
      log(`  ✗ ${message}`);
    }
    console.log(lines.join("\n"));
  }

  // parallel 本ずつ同時に処理する(各ワーカーは1店舗ごとに少し間を空ける)。
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(parallel, targets.length)) }, async () => {
    while (next < targets.length) {
      const i = next++;
      await processShop(targets[i], i);
      done += 1;
      if (quiet && done % 10 === 0) console.log(`  … ${done}/${targets.length}件 処理済み`);
      await sleep(REQUEST_INTERVAL_MS);
    }
  });
  await Promise.all(workers);

  console.log(
    `\n完了: 耳打ちあり ${counts.whisper}件 / なし ${counts.none}件` +
      `(うち安全網で不採用 ${counts.rejected}件) / 営業停止・閉店の疑い ${counts.closed}件 / 失敗 ${counts.failed}件`,
  );
  if (out) {
    writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(`結果を書き出しました: ${out}`);
  }
}

main();
