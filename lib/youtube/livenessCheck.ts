import { createAdminClient } from "@/lib/supabase/admin";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
/** 連続で「見つからない」と判定された回数がこれに達したらリールを下書きに戻す(1回の不調では動かさない)。 */
export const HIDE_AFTER = 3;
const BATCH = 50;

type Verdict = { alive: true } | { alive: false; reason: string };

type YoutubeStatusItem = {
  id: string;
  status?: { privacyStatus?: string; uploadStatus?: string; embeddable?: boolean };
};

function apiKey() {
  return process.env.YOUTUBE_DATA_API_KEY ?? process.env.YOUTUBE_API_KEY ?? null;
}

/** videos.list(part=status)は50本1クォータ。削除された動画は結果に含まれない。 */
async function fetchYoutubeVerdicts(ids: string[], key: string): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const url = new URL(`${YOUTUBE_API}/videos`);
    url.searchParams.set("key", key);
    url.searchParams.set("part", "status");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("maxResults", String(chunk.length));
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    // API自体の失敗は動画の死活とは無関係なので、この束は判定せず次回に回す。
    if (!response.ok) throw new Error(`YouTube API ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const body = (await response.json()) as { items?: YoutubeStatusItem[] };
    const found = new Map((body.items ?? []).map((item) => [item.id, item]));
    for (const id of chunk) {
      const item = found.get(id);
      if (!item) {
        verdicts.set(id, { alive: false, reason: "動画が見つかりません(削除された可能性)" });
      } else if (item.status?.privacyStatus === "private") {
        verdicts.set(id, { alive: false, reason: "動画が非公開になっています" });
      } else if (item.status?.uploadStatus && item.status.uploadStatus !== "processed" && item.status.uploadStatus !== "uploaded") {
        verdicts.set(id, { alive: false, reason: `動画が利用できません(${item.status.uploadStatus})` });
      } else if (item.status?.embeddable === false) {
        verdicts.set(id, { alive: false, reason: "埋め込みが禁止されています" });
      } else {
        verdicts.set(id, { alive: true });
      }
    }
  }
  return verdicts;
}

type Row = {
  id: string;
  youtube_id: string | null;
  reel_id: string;
  liveness_fail_count: number | null;
  auto_hidden_at: string | null;
};

/**
 * 収集ストックから公開したYouTube動画の死活を確認する。
 *  - 見つからない/非公開/埋め込み禁止: 失敗回数を+1。HIDE_AFTER回連続でリールを下書きにする(公開中のものだけ)。
 *  - 生きている: 失敗回数を0に戻す。自動で下げていたものは公開に戻す(手動で下書きにしたものは触らない)。
 * TikTokは公式の埋め込みAPIが存在しない動画にも成功を返すため、サーバー側では判定できず対象外。
 */
export async function runVideoLivenessCheck(options: { dryRun?: boolean } = {}) {
  const key = apiKey();
  if (!key) return { skipped: "YOUTUBE_DATA_API_KEY or YOUTUBE_API_KEY not set" } as const;
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("locapass_youtube_ingestions")
    .select("id, youtube_id, reel_id, liveness_fail_count, auto_hidden_at")
    .eq("source_provider", "youtube")
    .not("reel_id", "is", null)
    .not("youtube_id", "is", null);
  if (error) throw new Error(`対象の取得に失敗しました: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const reelIds = rows.map((r) => r.reel_id);
  const reelStatus = new Map<string, string>();
  for (let i = 0; i < reelIds.length; i += 200) {
    const { data: reels, error: reelError } = await admin.from("locapass_reels").select("id, status").in("id", reelIds.slice(i, i + 200));
    if (reelError) throw new Error(`リールの取得に失敗しました: ${reelError.message}`);
    for (const reel of reels ?? []) reelStatus.set(reel.id as string, reel.status as string);
  }
  // 手動で削除されたリール(行が無い)は対象外。
  const targets = rows.filter((r) => reelStatus.has(r.reel_id));

  const verdicts = await fetchYoutubeVerdicts([...new Set(targets.map((r) => r.youtube_id as string))], key);
  const now = new Date().toISOString();
  const summary = { checked: 0, alive: 0, failing: 0, hidden: [] as string[], restored: [] as string[], errors: [] as string[] };

  for (const row of targets) {
    const verdict = verdicts.get(row.youtube_id as string);
    if (!verdict) continue;
    summary.checked++;
    const status = reelStatus.get(row.reel_id);
    const patch: Record<string, unknown> = { liveness_checked_at: now };

    if (verdict.alive) {
      summary.alive++;
      patch.liveness_fail_count = 0;
      patch.liveness_reason = null;
      // 自動で下げたものだけを戻す。下書きのまま運営が触っていないことは auto_hidden_at が残っていることで分かる。
      if (row.auto_hidden_at && status === "draft") {
        if (!options.dryRun) {
          // 店舗が自分で非表示(書庫)にしたリール(hidden_reasonあり)は、動画が見られても戻さない。
          const { data: restored, error: restoreError } = await admin.from("locapass_reels").update({ status: "publish" }).eq("id", row.reel_id).eq("status", "draft").is("hidden_reason", null).select("id");
          if (restoreError) {
            summary.errors.push(`復活失敗 ${row.reel_id}: ${restoreError.message}`);
            continue;
          }
          if (!restored?.length) {
            // 店舗側で非表示にされていた。自動で下げた記録だけ消して、公開には戻さない。
            patch.auto_hidden_at = null;
            if (!options.dryRun) await admin.from("locapass_youtube_ingestions").update(patch).eq("id", row.id);
            continue;
          }
        }
        patch.auto_hidden_at = null;
        summary.restored.push(row.reel_id);
      } else if (row.auto_hidden_at) {
        // 自動で下げた後に運営が公開に戻した/削除した場合は、記録だけ消す。
        patch.auto_hidden_at = null;
      }
    } else {
      summary.failing++;
      const fails = (row.liveness_fail_count ?? 0) + 1;
      patch.liveness_fail_count = fails;
      patch.liveness_reason = verdict.reason;
      if (fails >= HIDE_AFTER && status === "publish") {
        if (!options.dryRun) {
          const { data: hidden, error: hideError } = await admin.from("locapass_reels").update({ status: "draft" }).eq("id", row.reel_id).eq("status", "publish").select("id");
          if (hideError || !hidden?.length) {
            summary.errors.push(`非表示失敗 ${row.reel_id}: ${hideError?.message ?? "更新0件"}`);
            continue;
          }
        }
        patch.auto_hidden_at = now;
        summary.hidden.push(row.reel_id);
      }
    }

    if (!options.dryRun) {
      const { error: updateError } = await admin.from("locapass_youtube_ingestions").update(patch).eq("id", row.id);
      if (updateError) summary.errors.push(`記録失敗 ${row.id}: ${updateError.message}`);
    }
  }
  return summary;
}
