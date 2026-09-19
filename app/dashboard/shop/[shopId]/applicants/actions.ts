"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hashDob, hashName, hashPhone } from "@/lib/blacklist/identifier";

/**
 * 応募者の登録と与信照会(本家 app/dashboard/applicants/actions.ts)。
 * 照会先は locapass の照会データ(locapass_blacklists)で、LUXELA とは共有しない。
 * 本家と同じく、生の個人情報は送らずハッシュで照会し、一致度と件数だけを受け取る。
 */
export async function addApplicant(shopId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: ok } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!ok) throw new Error("所属店舗が見つかりません");

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const dob = String(formData.get("dob") ?? "").trim();
  if (!name || !phone) throw new Error("氏名と電話番号は必須です");

  const [phoneHash, nameHash, dobHash] = await Promise.all([
    hashPhone(phone),
    hashName(name),
    dob ? hashDob(dob) : Promise.resolve(null),
  ]);

  const { data: riskResult, error: riskError } = await supabase
    .rpc("locapass_check_person_risk", {
      p_phone_hash: phoneHash,
      p_name_hash: nameHash,
      p_dob_hash: dobHash as string,
      p_target_type: "cast",
    })
    .single();
  if (riskError) throw new Error(`与信照会に失敗しました: ${riskError.message}`);

  const { error: insertError } = await supabase.from("locapass_applicants").insert({
    shop_id: shopId,
    name,
    phone,
    dob: dob || null,
    last_check_match_level: riskResult.match_level,
    last_check_hit_count: riskResult.hit_count,
    last_checked_at: new Date().toISOString(),
  });
  if (insertError) throw new Error(`応募者の登録に失敗しました: ${insertError.message}`);

  revalidatePath(`/dashboard/shop/${shopId}/applicants`);
}
