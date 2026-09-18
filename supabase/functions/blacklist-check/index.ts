// POST { phone: string, name?: string, dob?: string, target_type?: 'customer' | 'cast' }
// -> { match_level: 'none' | 'caution' | 'flagged', max_risk_level: number | null }
//
// 電話番号・氏名・生年月日のうち2項目一致で「該当あり(flagged)」、
// 1項目のみの一致は「注意(caution)」として区別する
// (電話番号は番号再割当で誤検知しうるし、氏名+生年月日だけの一致も
// 同姓同名・同じ誕生日の別人が実在しうるため、単独では確定情報として扱わない)。
//
// 顧客は電話番号以外を取得できない(偽名前提)ことが多いため name/dob は任意。
// 生の個人情報はここでハッシュ化された時点で捨てられ、DBには一切保存しない。

import { createClient } from "jsr:@supabase/supabase-js@2";
import { hashDob, hashName, hashPhone } from "../_shared/identifier.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { phone, name, dob, target_type = "customer" } = await req.json();
  if (!phone || !["customer", "cast"].includes(target_type)) {
    return new Response("Bad Request", { status: 400 });
  }

  // 呼び出しユーザー自身のJWTを転送する。
  // check_person_risk は SECURITY DEFINER のため authenticated ロールでも
  // 全店舗分を横断照会できるが、戻り値には該当区分と深刻度しか含まれない。
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const [phoneHash, nameHash, dobHash] = await Promise.all([
    hashPhone(phone),
    name ? hashName(name) : Promise.resolve(null),
    dob ? hashDob(dob) : Promise.resolve(null),
  ]);

  const { data, error } = await supabase
    .rpc("check_person_risk", {
      p_phone_hash: phoneHash,
      p_name_hash: nameHash,
      p_dob_hash: dobHash,
      p_target_type: target_type,
    })
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
