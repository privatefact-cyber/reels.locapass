"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, collectRegion } from "@/lib/overseas/scout";

const PATH = "/admin/overseas";

export async function collectOverseas(formData: FormData) {
  await requireRootAdmin();
  const region = String(formData.get("region") ?? "cebu");
  const duration = String(formData.get("duration") ?? "medium") === "short" ? "short" : "medium";
  if (!REGIONS.some((r) => r.key === region)) redirect(`${PATH}?error=${encodeURIComponent("不明な地域です")}`);
  let message: string;
  try {
    const r = await collectRegion(region, duration);
    message = `検索${r.queries}回 → 動画${r.found}本 → 新しく${r.added}本を保存(日本語の要約 ${r.summarized}本)${r.errors.length ? ` / 失敗: ${r.errors.slice(0, 2).join(" ・ ")}` : ""}`;
  } catch (e) {
    redirect(`${PATH}?region=${region}&error=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 300) : "失敗しました")}`);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?region=${region}&ok=${encodeURIComponent(message)}`);
}

async function patch(id: string, values: Record<string, boolean>) {
  await requireRootAdmin();
  const { data, error } = await (createAdminClient() as any).from("locapass_overseas_notes").update(values).eq("id", id).select("id");
  if (error || !data?.length) throw new Error("更新できませんでした");
  revalidatePath(PATH);
}

export async function setStar(id: string, value: boolean) {
  await patch(id, { starred: value });
}
export async function setHidden(id: string, value: boolean) {
  await patch(id, { hidden: value });
}
