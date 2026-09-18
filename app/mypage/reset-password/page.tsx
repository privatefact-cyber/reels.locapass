import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MypageResetPasswordClient } from "@/components/MypageResetPasswordClient";

export default async function MypageResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/mypage/login");
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="font-display text-xl font-semibold uppercase tracking-[0.2em] text-gold">
        新しいパスワードを設定
      </h1>
      <p className="mt-2 text-sm text-neutral-400">{user.email}</p>
      <MypageResetPasswordClient />
    </div>
  );
}
