"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PasswordSetupModal } from "@/components/locapass-mypage/PasswordSetupModal";

/**
 * 店舗管理画面のどのページから入っても、初期パスワードのままなら、最初に「パスワードを決めてください」を出す。
 * (以前は「店舗情報」のページを開いたときにしか出なかった。変更は、メニューの「アカウント」から、あとでもできる。)
 */
export function PasswordSetupGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    createClient()
      .rpc("needs_password_setup")
      .then(({ data }) => {
        if (data) setOpen(true);
      });
  }, []);
  return <PasswordSetupModal open={open} onClose={() => setOpen(false)} forced />;
}
