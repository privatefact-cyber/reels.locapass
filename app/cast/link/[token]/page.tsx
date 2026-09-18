"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 店舗が発行したマジックリンク経由でマイページへログインする。
 * トークンを消費してワンタイムパスワードを発行し、そのままsignInWithPasswordする。
 * リンクは何度でも再利用できる(訪問のたびにパスワードが更新される)。
 */
export default function CastLoginLinkPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function login() {
      const supabase = createClient();
      const { data, error } = await supabase
        .rpc("redeem_cast_login_token", { p_token: params.token })
        .single();

      if (cancelled) return;
      if (error || !data) {
        setStatus("error");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.login_email,
        password: data.one_time_password,
      });

      if (cancelled) return;
      if (signInError) {
        setStatus("error");
        return;
      }

      router.push("/cast/mypage");
      router.refresh();
    }

    void login();
    return () => {
      cancelled = true;
    };
  }, [params.token, router]);

  if (status === "error") {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 text-center">
        <h1 className="text-lg font-bold">ログインできませんでした</h1>
        <p className="mt-2 text-sm text-neutral-400">
          このリンクは無効です。店舗の担当者に最新のリンクを再送してもらってください。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10 text-center">
      <p className="text-sm text-neutral-400">ログイン中...</p>
    </div>
  );
}
