import { redirect } from "next/navigation";

// ロール別の画面を /dashboard 配下に分けたため、旧URLは転送する(/dashboard/cast)。
export default function LegacyRedirect() {
  redirect("/dashboard/cast");
}
