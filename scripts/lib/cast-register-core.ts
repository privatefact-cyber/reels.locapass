/**
 * キャスト登録の共通ロジック。register-cast.ts(CSV入力)と
 * register-cast-from-json.ts(Notion連携用のJSON入力)の両方から使う。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import { config } from "dotenv";
import { join } from "node:path";
import type { Database } from "@/types/supabase";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

export type CastInput = {
  shop: string;
  name: string;
  age?: string | number | null;
  prText?: string | null;
  /** 実ファイルの絶対/相対パス。1枚目がメイン写真になる。 */
  photoPaths: string[];
};

export type ResultRow = {
  shop: string;
  name: string;
  status: "success" | "error";
  castId?: string;
  loginEmail?: string;
  initialPassword?: string;
  error?: string;
};

function contentTypeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

export async function registerCasts(inputs: CastInput[]): Promise<ResultRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const staffEmail = process.env.AUTOMATION_STAFF_EMAIL;
  const staffPassword = process.env.AUTOMATION_STAFF_PASSWORD;
  if (!supabaseUrl || !supabaseAnonKey || !staffEmail || !staffPassword) {
    throw new Error(
      ".env.local に NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / AUTOMATION_STAFF_EMAIL / AUTOMATION_STAFF_PASSWORD が必要です",
    );
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: staffEmail,
    password: staffPassword,
  });
  if (signInError) throw new Error(`自動化アカウントのログインに失敗しました: ${signInError.message}`);

  const { data: shops } = await supabase.from("shops").select("id, name");
  const shopIdByName = new Map((shops ?? []).map((s) => [s.name, s.id]));

  const results: ResultRow[] = [];

  for (const row of inputs) {
    const shopId = shopIdByName.get(row.shop);
    if (!shopId) {
      results.push({ shop: row.shop, name: row.name, status: "error", error: `店舗「${row.shop}」が見つかりません` });
      continue;
    }
    if (!row.name) {
      results.push({ shop: row.shop, name: row.name, status: "error", error: "源氏名が空です" });
      continue;
    }

    try {
      const age = row.age === "" || row.age == null ? null : Number(row.age);
      const { data: cast, error: castError } = await supabase
        .from("cast_members")
        .insert({
          shop_id: shopId,
          name: row.name,
          age,
          pr_text: row.prText || null,
        })
        .select("id")
        .single();
      if (castError || !cast) throw new Error(castError?.message ?? "キャスト登録に失敗");

      let displayOrder = 0;
      let avatarUrl: string | null = null;
      for (const filePath of row.photoPaths) {
        if (!existsSync(filePath)) {
          console.warn(`  [警告] 写真が見つかりません: ${filePath}(スキップ)`);
          continue;
        }
        const fileBuffer = readFileSync(filePath);
        const storagePath = `${cast.id}/${Date.now()}-${displayOrder}${extname(filePath)}`;
        const { error: uploadError } = await supabase.storage
          .from("cast-media")
          .upload(storagePath, fileBuffer, { contentType: contentTypeFor(filePath) });
        if (uploadError) {
          console.warn(`  [警告] アップロード失敗(${filePath}): ${uploadError.message}`);
          continue;
        }
        const { data: publicUrl } = supabase.storage.from("cast-media").getPublicUrl(storagePath);
        const { error: mediaError } = await supabase.from("media").insert({
          cast_id: cast.id,
          shop_id: shopId,
          url: publicUrl.publicUrl,
          display_order: displayOrder,
        });
        if (mediaError) console.warn(`  [警告] media登録失敗(${filePath}): ${mediaError.message}`);
        if (displayOrder === 0) avatarUrl = publicUrl.publicUrl;
        displayOrder++;
      }

      // 1枚目の写真を、マイページ等で使うアイコン(avatar_url)としてもデフォルト設定する。
      if (avatarUrl) {
        const { error: avatarError } = await supabase
          .from("cast_members")
          .update({ avatar_url: avatarUrl })
          .eq("id", cast.id);
        if (avatarError) console.warn(`  [警告] アイコン設定失敗: ${avatarError.message}`);
      }

      const { data: invite, error: inviteError } = await supabase
        .rpc("create_cast_invite", { p_cast_id: cast.id })
        .single();
      if (inviteError || !invite) throw new Error(inviteError?.message ?? "ログイン発行に失敗");

      results.push({
        shop: row.shop,
        name: row.name,
        status: "success",
        castId: cast.id,
        loginEmail: invite.login_email,
        initialPassword: invite.initial_password,
      });
      console.log(`✓ ${row.shop} / ${row.name} 登録完了(写真${displayOrder}枚)`);
    } catch (e) {
      results.push({ shop: row.shop, name: row.name, status: "error", error: (e as Error).message });
      console.error(`✗ ${row.shop} / ${row.name}: ${(e as Error).message}`);
    }
  }

  await supabase.auth.signOut();
  return results;
}
