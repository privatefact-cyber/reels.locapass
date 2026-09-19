import { redirect } from "next/navigation";

// ロール別の画面を /dashboard 配下に分けたため、旧URLは転送する(/login)。
export default function LegacyRedirect() {
  redirect("/login?next=/dashboard/staff");
}
