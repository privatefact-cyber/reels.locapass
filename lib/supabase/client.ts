"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // 一般ユーザーのマイページはブラウザを閉じても再ログイン不要にしたいため明示する
      // (@supabase/ssrのデフォルトも同じ挙動だが、意図を明確にするため明示的に指定)。
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  );
}
