import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles, hasManagementRole } from "@/lib/auth/roles";
import { PhotoComposer } from "@/components/photo/PhotoComposer";

export const metadata: Metadata = { title: "写真を投稿", robots: { index: false } };

export default async function NewPhotoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/mypage/login?redirect=${encodeURIComponent("/photo/new")}`);

  const canOperator = hasManagementRole(await fetchMyRoles(supabase));
  return <PhotoComposer canOperator={canOperator} />;
}
