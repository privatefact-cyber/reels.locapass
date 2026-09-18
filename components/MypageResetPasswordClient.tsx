"use client";

import { useRouter } from "next/navigation";
import { MypagePasswordForm } from "@/components/MypagePasswordForm";

export function MypageResetPasswordClient() {
  const router = useRouter();

  return (
    <MypagePasswordForm
      onSuccess={() => {
        setTimeout(() => {
          router.push("/mypage");
          router.refresh();
        }, 1000);
      }}
    />
  );
}
