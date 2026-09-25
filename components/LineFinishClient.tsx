"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// magiclinkのaction_linkはSupabaseの/auth/v1/verifyを経由し、最終的にここへ
// URLハッシュ(#access_token=...)付きでリダイレクトされてくる(生成リンクは常に
// この昔ながらの形式で返るため、アプリ本体がPKCEフローで動いていても関係ない)。
// クライアントSDKの自動検知(detectSessionInUrl)はPKCEモードだと?code=しか見ないため、
// ここではハッシュを自分でパースしてsetSession()に渡し、明示的にセッションを
// 確立・永続化(ブラウザCookieに書き込み)してから、ハードリロードで本来の遷移先へ渡す。
// これによりサーバーコンポーネント側も次のリクエストで正しくログイン済みと判定できる。
export function LineFinishClient() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/mypage";
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function run() {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      const { data } = access_token && refresh_token
        ? await supabase.auth.setSession({ access_token, refresh_token })
        : await supabase.auth.getSession();

      if (cancelled) return;
      if (data.session) {
        window.location.href = redirect;
      } else {
        setError(true);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-sm px-4 py-12 text-center">
        <p className="text-sm text-red-400">ログインに失敗しました。もう一度お試しください。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12 text-center">
      <p className="text-sm text-muted">ログイン中...</p>
    </div>
  );
}
