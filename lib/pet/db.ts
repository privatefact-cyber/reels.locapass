import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * ワンコ手帳(/pet)用のSupabaseクライアント。
 * locapass_pet_* のテーブルはまだ型生成(types/supabase.ts)に入っていないので、型なしのクライアントを使う。
 * - petUserClient: ログイン中の本人として(RLSで本人の行だけ読み書きできる)
 * - petAdmin: サーバー専用(RLSを無視)。他人に見せる部分(名刺・迷子・フォロー・通知)だけで使い、
 *   返す列は呼び出し側で必ず絞ること。
 */
export async function petUserClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Componentから呼ばれた場合は無視(ミドルウェアでセッションを更新している)
        }
      },
    },
  });
}

export function petAdmin(): SupabaseClient {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** ログイン中なら本人のIDとクライアントを返す。未ログインなら null。 */
export async function getPetViewer(): Promise<{ userId: string; supabase: SupabaseClient } | null> {
  const supabase = await petUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { userId: user.id, supabase };
}

/** ログイン必須のページ用。未ログインならログイン画面へ(戻り先つき)。 */
export async function requirePetViewer(back = "/pet"): Promise<{ userId: string; supabase: SupabaseClient }> {
  const viewer = await getPetViewer();
  if (!viewer) redirect(`/mypage/login?redirect=${encodeURIComponent(back)}`);
  // 初回ログインの人は会員行を作る(マイページと同じ)
  const { data: member } = await viewer.supabase.from("locapass_members").select("id").eq("id", viewer.userId).maybeSingle();
  if (!member) await viewer.supabase.from("locapass_members").insert({ id: viewer.userId, nickname: "ゲスト" });
  return viewer;
}

export const PET_BUCKET = "pet-private";

/** 非公開の置き場の画像を、期限付きURLにする(既定1時間)。見つからない・空は null。 */
export async function signPetImages(paths: (string | null | undefined)[], expiresIn = 3600): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => typeof p === "string" && p.length > 0))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await petAdmin().storage.from(PET_BUCKET).createSignedUrls(unique, expiresIn);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}
