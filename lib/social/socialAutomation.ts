import { createAdminClient } from "@/lib/supabase/admin";
import type { SocialAccount } from "@/lib/social/instagram";
import { createImageDraft, publishThreadsDraft, type Destination } from "@/lib/social/threadsPosts";
import { createResearchDraft } from "@/lib/social/socialResearch";

const db = () => createAdminClient() as any;
export type AutomationMode = "draft" | "auto";
export type AutomationSource = "ai" | "shop" | "research";
export type AutomationSetting = {
  platform: "threads" | "instagram"; account: SocialAccount; enabled: boolean; mode: AutomationMode;
  source: AutomationSource; run_hour_jst: number; daily_max: number; emergency_stop: boolean;
  last_run_on: string | null; last_error: string | null;
};

const DESTINATIONS: Destination[] = [
  { platform: "threads", account: "locapass" }, { platform: "instagram", account: "locapass" },
  { platform: "threads", account: "luxela" }, { platform: "instagram", account: "luxela" },
];

function defaultSetting(dest: Destination): AutomationSetting {
  return { ...dest, enabled: false, mode: "draft", source: "shop", run_hour_jst: 12, daily_max: 1, emergency_stop: false, last_run_on: null, last_error: null };
}

export async function getAutomationSettings(): Promise<AutomationSetting[]> {
  const { data, error } = await db().from("locapass_social_automation").select("platform, account, enabled, mode, source, run_hour_jst, daily_max, emergency_stop, last_run_on, last_error");
  if (error) return DESTINATIONS.map(defaultSetting);
  return DESTINATIONS.map((dest) => (data ?? []).find((r: AutomationSetting) => r.platform === dest.platform && r.account === dest.account) ?? defaultSetting(dest));
}

export async function saveAutomationSetting(input: AutomationSetting): Promise<void> {
  if (!Number.isInteger(input.run_hour_jst) || input.run_hour_jst < 0 || input.run_hour_jst > 23) throw new Error("実行時刻は0〜23時で指定してください");
  if (!Number.isInteger(input.daily_max) || input.daily_max < 1 || input.daily_max > 3) throw new Error("1日の上限は1〜3件です");
  const row = { platform: input.platform, account: input.account, enabled: input.enabled, mode: input.mode, source: input.source, run_hour_jst: input.run_hour_jst, daily_max: input.daily_max, emergency_stop: input.emergency_stop, updated_at: new Date().toISOString() };
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
  for (const setting of settings) {
    const destination = `${setting.platform}:${setting.account}`;
    if (!setting.enabled || setting.emergency_stop || setting.run_hour_jst !== now.hour) continue;
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { count } = await admin.from("locapass_threads_posts").select("id", { count: "exact", head: true })
      .eq("platform", setting.platform).eq("account", setting.account).eq("status", "posted").gte("posted_at", since);
    if ((count ?? 0) >= setting.daily_max) { out.push({ destination, result: "daily-cap" }); continue; }

    // 同じ日の同じ投稿先は、cronが重なっても1回だけ進める。
    const { error: claimError } = await admin.from("locapass_social_automation_runs").insert({ platform: setting.platform, account: setting.account, run_on: now.date, status: "running" });
    if (claimError?.code === "23505") { out.push({ destination, result: "already-ran" }); continue; }
    if (claimError) throw new Error(`自動運転の開始記録を作れませんでした: ${claimError.message}`);
    try {
      const id = setting.source === "research" ? await createResearchDraft({ platform: setting.platform, account: setting.account }) : await createImageDraft(setting.source, { platform: setting.platform, account: setting.account }, "auto");
      if (setting.mode === "auto") await publishThreadsDraft(id);
      await admin.from("locapass_social_automation_runs").update({ status: setting.mode === "auto" ? "posted" : "drafted", post_id: id, finished_at: new Date().toISOString() }).eq("platform", setting.platform).eq("account", setting.account).eq("run_on", now.date);
      await admin.from("locapass_social_automation").update({ last_run_on: now.date, last_error: null }).eq("platform", setting.platform).eq("account", setting.account);
      out.push({ destination, result: setting.mode === "auto" ? "posted" : "drafted" });
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 400) : "自動運転に失敗しました";
      await admin.from("locapass_social_automation_runs").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("platform", setting.platform).eq("account", setting.account).eq("run_on", now.date);
      await admin.from("locapass_social_automation").update({ last_run_on: now.date, last_error: message }).eq("platform", setting.platform).eq("account", setting.account);
      out.push({ destination, result: `failed: ${message}` });
    }
  }
  return out;
}
