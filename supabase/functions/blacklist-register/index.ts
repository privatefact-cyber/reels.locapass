// POST { phone: string, name?: string, dob?: string, target_type: 'customer' | 'cast',
//        risk_level: 1|2|3, reason_category?: string, shop_id: string, memo: string }
// -> { id: string }
//
// customer は氏名・生年月日を省略できる(偽名前提のため取得できないことが多い)。
// cast は氏名・生年月日が必須(DB側の check 制約でも強制される)。
// 生の個人情報はここでハッシュ化された時点で捨てられ、DBには各ハッシュのみ保存される。
// registered_by_shop_id が呼び出しユーザーの所属店舗と一致するかは
// blacklists の INSERT ポリシーがDB側で強制する。
//
// memo: どのような状況で登録したかを説明する自由記述。運営者(当社)が後日トラブル発生時に
// 状況を把握して対処するためのもので、加盟店側(登録した店舗自身も含む)には二度と
// 見せない前提の項目(blacklist_registration_notes には SELECT ポリシーを一切用意していない)。
// そのため必須項目とする。

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

  const { phone, name, dob, target_type, risk_level, reason_category, shop_id, memo } =
    await req.json();

  if (
    !phone ||
    !["customer", "cast"].includes(target_type) ||
    ![1, 2, 3].includes(risk_level) ||
    !shop_id ||
    !memo
  ) {
    return new Response("Bad Request", { status: 400 });
  }

  if (target_type === "cast" && (!name || !dob)) {
    return new Response(
      JSON.stringify({ error: "cast registration requires name and dob" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

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
    .from("blacklists")
    .insert({
      phone_hash: phoneHash,
      name_hash: nameHash,
      dob_hash: dobHash,
      target_type,
      risk_level,
      reason_category: reason_category ?? null,
      registered_by_shop_id: shop_id,
    })
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error: noteError } = await supabase
    .from("blacklist_registration_notes")
    .insert({
      blacklist_id: data.id,
      note: memo,
      created_by_shop_id: shop_id,
    });

  if (noteError) {
    // ブラックリスト本体は既に登録済み。メモだけ失敗した場合はその旨を伝える
    // (呼び出し元は再度メモ登録をリトライできるよう blacklist_id を返す)。
    return new Response(
      JSON.stringify({ id: data.id, error: `entry created but memo failed: ${noteError.message}` }),
      { status: 207, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
});
