"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hashDob, hashName, hashPhone } from "@/lib/blacklist/identifier";

export async function addApplicant(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("ログインが必要です");
  }

  const { data: staffRow } = await supabase
    .from("shop_staff")
    .select("shop_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!staffRow) {
    throw new Error("所属店舗が見つかりません");
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const dob = String(formData.get("dob") ?? "").trim();

  if (!name || !phone) {
    throw new Error("氏名と電話番号は必須です");
  }

  const [phoneHash, nameHash, dobHash] = await Promise.all([
    hashPhone(phone),
    hashName(name),
    dob ? hashDob(dob) : Promise.resolve(null),
  ]);

  const { data: riskResult, error: riskError } = await supabase
    .rpc("check_person_risk", {
      p_phone_hash: phoneHash,
      p_name_hash: nameHash,
      p_dob_hash: dobHash as string,
      p_target_type: "cast",
    })
    .single();

  if (riskError) {
    throw new Error(`与信照会に失敗しました: ${riskError.message}`);
  }

  const { error: insertError } = await supabase.from("applicants").insert({
    shop_id: staffRow.shop_id,
    name,
    phone,
    dob: dob || null,
    last_check_match_level: riskResult.match_level,
    last_check_hit_count: riskResult.hit_count,
    last_checked_at: new Date().toISOString(),
  });

  if (insertError) {
    throw new Error(`応募者の登録に失敗しました: ${insertError.message}`);
  }

  revalidatePath("/dashboard/applicants");
}
