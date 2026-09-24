/**
 * 街の声: 店舗のWeb/SNS上の情報を集めてDBに蓄積し、客向けのポジティブな噂ネタ(locapass_shops.sns_whisper)を更新するCLI。
 * 1店舗ぶんの処理は lib/streetWhispers/pipeline.ts(オンデマンドAPIと共通)。ここは対象を選んで回すだけ。
 *
 * locapass版(LUXELAの ~/Downloads/modella/scripts/sync-street-whispers.ts と同じ作り)。
 * 通常の更新は「見られた店だけ」オンデマンドAPI(POST /api/shops/[id]/sync-whisper)が裏で行う。
 * このCLIは、特定の店舗をすぐ更新したい・試したいときの手動用。
 *
 * 使い方:
 *   npm run sync-whispers -- --shop="HITACHINO"               # 店名(部分一致)の店舗だけ更新
 *   npm run sync-whispers -- --id=<shop uuid>                 # IDで1店舗だけ更新
 *   npm run sync-whispers -- --dry-run --shop="JUNGLE TOKYO"  # 調べるだけで書き込まない(生データ・判定JSONを表示)
 *   npm run sync-whispers -- --portal=mito                    # ポータル(locapass_portals.slug)の店舗をまとめて
 *   npm run sync-whispers -- --limit=20                       # 古い順に20店舗
 *   npm run sync-whispers -- --force --shop="..."             # 3日ルール・1日上限・手入力(manual)を無視して調べ直す
 *   npm run sync-whispers -- --parallel=8                     # 同時処理数(既定5)
 *   npm run sync-whispers -- --quiet                          # 生データ・判定JSONのログを省略
 *   npm run sync-whispers -- --dry-run --out=/tmp/w.json      # 結果をJSONに書き出す
 *
 * --force が無い場合は、最後に調べてから3日以内の店舗はスキップし、1日の上限(DAILY_WHISPER_UPDATE_LIMIT、
 * 両サイト合計・既定100件)に達したらそこで止まる。--dry-run は書き込まないので日数・上限を気にせず調べる。
 *
 * 接続には運営権限が要る。.env.local に SUPABASE_SERVICE_ROLE_KEY を置くこと(--dry-run は anon キーでも動く)。
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { join } from "node:path";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const SITE = "locapass" as const;
/** 各ワーカーが1店舗ごとに空ける間隔(ms)。検索グラウンディングのレート制限に余裕を持たせる。 */
const REQUEST_INTERVAL_MS = 500;
/** 同時に処理する店舗数(--parallel で変更可)。 */
const DEFAULT_PARALLEL = 5;

/** --key value と --key=value の両方を受け付ける。 */
function parseArgs() {
  const args = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const eq = args.find((a) => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1);
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

function connect(readOnly: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (readOnly ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined);
  if (!url || !key) {
    console.error(".env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  // pipeline は DAILY_WHISPER_UPDATE_LIMIT などの環境変数を読み込み時に参照するので、dotenv の後で読み込む。
  const { syncSingleShopWhisper, shopSelectColumns, countTodayRuns, DAILY_CAP, REFRESH_DAYS } = await import(
    "../lib/streetWhispers/pipeline"
  );
  type ShopRow = import("../lib/streetWhispers/pipeline").ShopRow;

  const { dryRun, force, quiet, limit, parallel, shop: shopFilter, portal, id, out } = parseArgs();
  const supabase = connect(dryRun);

  let query = supabase
    .from("locapass_shops")
    .select(shopSelectColumns(SITE))
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

  const targets = ((shops ?? []) as unknown as ShopRow[]).slice(0, limit);
  const usedToday = dryRun ? 0 : await countTodayRuns(supabase);
  console.log(
    `対象: ${targets.length}件 (同時${parallel}店)` +
      (dryRun ? " (dry-run: 書き込みません)" : ` / 今日の実行 ${usedToday}/${DAILY_CAP}件 / ${REFRESH_DAYS}日以内に調べた店はスキップ`) +
      (force ? " (force: 日数・上限・manualを無視)" : ""),
  );

  const results: unknown[] = [];
  const counts = { whisper: 0, none: 0, closed: 0, rejected: 0, fresh: 0, failed: 0 };
  let capped = false;

  // 並列処理でログが混ざらないよう、1店舗分のログをためてまとめて出す。
  async function processShop(shop: ShopRow, i: number) {
    const lines: string[] = [`\n[${i + 1}/${targets.length}] ${shop.name}`];
    const log = (line: string) => lines.push(line);
    // dry-run は書き込まないので、3日ルール・上限に関係なく調べる。
    const result = await syncSingleShopWhisper(supabase, SITE, shop, { force: force || dryRun, dryRun });

    if (result.status === "fresh") {
      counts.fresh += 1;
      log(`  スキップ(${REFRESH_DAYS}日以内に調査済み)`);
    } else if (result.status === "capped") {
      capped = true;
      log(`  スキップ(今日の上限 ${DAILY_CAP}件に到達: ${result.usedToday}件)`);
    } else if (result.status === "failed" || result.status === "not_found") {
      counts.failed += 1;
      log(`  ✗ ${result.status === "failed" ? result.error : "店舗が見つかりません"}`);
    } else {
      const { verdict, whisper, rejected, keptManual, raw, sources, queries } = result;
      if (!quiet) {
        log(`  検索語: ${queries.join(" | ") || "(なし)"}`);
        log(`  根拠: ${sources.map((s) => s.title).join(", ") || "(なし)"}`);
        log(`  ── 収集した生テキスト ──\n${raw.replace(/^/gmu, "  │ ")}`);
        log(`  ── LLMの判定JSON ──\n  ${JSON.stringify(verdict)}`);
      }
      if (verdict.is_closed) counts.closed += 1;
      if (rejected) counts.rejected += 1;
      if (whisper && !keptManual) counts.whisper += 1;
      else counts.none += 1;
      const action = keptManual
        ? "耳打ちは手入力を維持"
        : whisper
          ? `耳打ちを更新: ${whisper}`
          : shop.sns_whisper
            ? "耳打ちを削除(ネタなし)"
            : "耳打ちなし";
      const closedNote = verdict.is_closed
        ? ` / ⚠ 営業停止・閉店の疑い(${verdict.closed_evidence ?? "根拠不明"})`
        : shop.is_temporarily_closed
          ? " / 営業停止フラグを解除"
          : "";
      log(`  ── 更新結果${dryRun ? "(dry-run・未保存)" : ""} ──\n  ${action}${closedNote}${rejected ? ` / ${rejected}` : ""}`);
    }
    results.push({ id: shop.id, name: shop.name, ...result });
    console.log(lines.join("\n"));
  }

  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(parallel, targets.length)) }, async () => {
    while (next < targets.length && !capped) {
      const i = next++;
      await processShop(targets[i], i);
      done += 1;
      if (quiet && done % 10 === 0) console.log(`  … ${done}/${targets.length}件 処理済み`);
      await sleep(REQUEST_INTERVAL_MS);
    }
  });
  await Promise.all(workers);

  console.log(
    `\n完了: 耳打ちあり ${counts.whisper}件 / なし ${counts.none}件(うち安全網で不採用 ${counts.rejected}件)` +
      ` / 営業停止・閉店の疑い ${counts.closed}件 / 調査済みでスキップ ${counts.fresh}件 / 失敗 ${counts.failed}件` +
      (capped ? `\n今日の上限(${DAILY_CAP}件)に達したので途中で止めました。明日以降に続きを実行してください。` : ""),
  );
  if (out) {
    writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(`結果を書き出しました: ${out}`);
  }
}

main();
