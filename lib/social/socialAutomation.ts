import { createAdminClient } from "@/lib/supabase/admin";
import type { SocialAccount } from "@/lib/social/instagram";
import { createImageDraft, createStoryDraft, createVideoDraft, publishThreadsDraft, type Destination } from "@/lib/social/threadsPosts";
import { createResearchDraft } from "@/lib/social/socialResearch";

const db = () => createAdminClient() as any;
export type AutomationMode = "draft" | "auto";
export type AutomationSource = "ai" | "shop" | "research";
/** 投稿のかたち。feed=通常の投稿(写真) / reel=リール(店舗の縦動画) / story=ストーリーズ(店舗の写真・Instagramのみ)。 */
export type AutomationForm = "feed" | "reel" | "story";
export const AUTOMATION_FORMS: AutomationForm[] = ["feed", "reel", "story"];
export type AutomationSetting = {
  platform: "threads" | "instagram"; account: SocialAccount; enabled: boolean; mode: AutomationMode;
  source: AutomationSource; forms: AutomationForm[]; run_hour_jst: number; daily_max: number; emergency_stop: boolean;
  last_run_on: string | null; last_error: string | null;
};

const DESTINATIONS: Destination[] = [
  { platform: "threads", account: "locapass" }, { platform: "instagram", account: "locapass" },
  { platform: "threads", account: "luxela" }, { platform: "instagram", account: "luxela" },
];

function defaultSetting(dest: Destination): AutomationSetting {
  return { ...dest, enabled: false, mode: "draft", source: "shop", forms: ["feed"], run_hour_jst: 12, daily_max: 1, emergency_stop: false, last_run_on: null, last_error: null };
}

/** 選ばれた投稿のかたちを整える。空なら通常のみ。ストーリーズはInstagramだけ。 */
export function normalizeForms(forms: unknown, platform: "threads" | "instagram"): AutomationForm[] {
  const list = AUTOMATION_FORMS.filter((f) => Array.isArray(forms) && forms.includes(f) && (f !== "story" || platform === "instagram"));
  return list.length ? list : ["feed"];
}

export async function getAutomationSettings(): Promise<AutomationSetting[]> {
  const { data, error } = await db().from("locapass_social_automation").select("platform, account, enabled, mode, source, forms, run_hour_jst, daily_max, emergency_stop, last_run_on, last_error");
  if (error) return DESTINATIONS.map(defaultSetting);
  return DESTINATIONS.map((dest) => (data ?? []).find((r: AutomationSetting) => r.platform === dest.platform && r.account === dest.account) ?? defaultSetting(dest)).map((r: AutomationSetting) => ({ ...r, forms: normalizeForms(r.forms, r.platform) }));
}

export async function saveAutomationSetting(input: AutomationSetting): Promise<void> {
  if (!Number.isInteger(input.run_hour_jst) || input.run_hour_jst < 0 || input.run_hour_jst > 23) throw new Error("実行時刻は0〜23時で指定してください");
  if (!Number.isInteger(input.daily_max) || input.daily_max < 1 || input.daily_max > 3) throw new Error("1日の上限は1〜3件です");
  const row = { platform: input.platform, account: input.account, enabled: input.enabled, mode: input.mode, source: input.source, forms: normalizeForms(input.forms, input.platform), run_hour_jst: input.run_hour_jst, daily_max: input.daily_max, emergency_stop: input.emergency_stop, updated_at: new Date().toISOString() };
  const { error } = await db().from("locapass_social_automation").upsert(row, { onConflict: "platform,account" });
  if (error) throw new Error(`自動運転の設定を保存できませんでした: ${error.message}`);
}

function jstNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}

/** 4投稿先を巡回する。初期値は停止。下書き運転で確認後、投稿先ごとに自動公開へ切り替えられる。 */
export async function runSocialAutomation(): Promise<Array<{ destination: string; result: string }>> {
  const admin = db();
  const settings = await getAutomationSettings();
  const now = jstNow();
  const out: Array<{ destination: string; result: string }> = [];
  const targets = settings.filter((setting) => setting.enabled && !setting.emergency_stop && setting.run_hour_jst === now.hour);
  // 投稿先ごとに順番に待つと、AIが混んでいるときに関数の制限時間(120秒)を超えてしまう。投稿先は独立しているので、同時に進める。
  await Promise.all(targets.map(async (setting) => {
    const destination = `${setting.platform}:${setting.account}`;
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { count } = await admin.from("locapass_threads_posts").select("id", { count: "exact", head: true })
      .eq("platform", setting.platform).eq("account", setting.account).eq("status", "posted").gte("posted_at", since);
    // 下書きは公開されないので上限の対象外。自動公開のときだけ、直近24時間の投稿数で止める。
    if (setting.mode === "auto" && (count ?? 0) >= setting.daily_max * setting.forms.length) { out.push({ destination, result: "daily-cap" }); return; }

    // 同じ日の同じ投稿先は、cronが重なっても1回だけ進める。ただし前回が失敗で終わっていたら、次の巡回(30分後)でやり直す。
    const { error: claimError } = await admin.from("locapass_social_automation_runs").insert({ platform: setting.platform, account: setting.account, run_on: now.date, status: "running" });
    if (claimError?.code === "23505") {
      const { data: retaken } = await admin.from("locapass_social_automation_runs").update({ status: "running", error: null, finished_at: null })
        .eq("platform", setting.platform).eq("account", setting.account).eq("run_on", now.date).eq("status", "failed").select("platform");
      if (!retaken?.length) { out.push({ destination, result: "already-ran" }); return; }
    } else if (claimError) {
      out.push({ destination, result: `failed: 自動運転の開始記録を作れませんでした: ${claimError.message}` });
      return;
    }
    try {
      const dest = { platform: setting.platform, account: setting.account };
      // 選ばれた「投稿のかたち」ごとに、下書きを1件ずつ作る。1つ失敗しても、ほかのかたちは続ける(1件も作れなかったときだけ失敗)。
      const ids: string[] = [];
      const problems: string[] = [];
      for (const form of setting.forms) {
        try {
          if (form === "reel") {
            ids.push(await createVideoDraft(dest));
          } else if (form === "story") {
            ids.push(await createStoryDraft(dest));
          } else if (setting.source === "research") {
            // Webリサーチは検索が混みやすい。失敗したら、その日の投稿を落とさず、通常のAI下書きに切り替える。
            try {
              ids.push(await createResearchDraft(dest));
            } catch (researchError) {
              console.error(`${destination}: Webリサーチに失敗したため、通常のAI下書きに切り替えます`, researchError);
              ids.push(await createImageDraft("ai", dest, "auto"));
            }
          } else {
            ids.push(await createImageDraft(setting.source, dest, "auto"));
          }
        } catch (formError) {
          problems.push(`${form}: ${formError instanceof Error ? formError.message : "失敗"}`);
        }
      }
      if (ids.length === 0) throw new Error(problems.join(" / ").slice(0, 400) || "下書きを作れませんでした");
      const id = ids[0];
      if (setting.mode === "auto") {
        for (const draftId of ids) {
          try { await publishThreadsDraft(draftId); } catch (publishError) { problems.push(`公開: ${publishError instanceof Error ? publishError.message : "失敗"}`); }
        }
      }
      await admin.from("locapass_social_automation_runs").update({ status: setting.mode === "auto" ? "posted" : "drafted", post_id: id, finished_at: new Date().toISOString() }).eq("platform", setting.platform).eq("account", setting.account).eq("run_on", now.date);
      await admin.from("locapass_social_automation").update({ last_run_on: now.date, last_error: problems.length ? problems.join(" / ").slice(0, 400) : null }).eq("platform", setting.platform).eq("account", setting.account);
      out.push({ destination, result: setting.mode === "auto" ? "posted" : "drafted" });
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 400) : "自動運転に失敗しました";
      await admin.from("locapass_social_automation_runs").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("platform", setting.platform).eq("account", setting.account).eq("run_on", now.date);
      await admin.from("locapass_social_automation").update({ last_run_on: now.date, last_error: message }).eq("platform", setting.platform).eq("account", setting.account);
      out.push({ destination, result: `failed: ${message}` });
    }
  }));
  return out;
}
