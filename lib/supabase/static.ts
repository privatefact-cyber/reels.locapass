import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * cookie(リクエストスコープ)に依存しない読み取り専用クライアント。
 * generateStaticParams・sitemap.tsなど、ビルド時/リクエスト外で実行される
 * 箇所で使う(lib/supabase/serverのcreateClientはcookies()を呼ぶため
 * それらのコンテキストではエラーになる)。
 */
export function createStaticClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
