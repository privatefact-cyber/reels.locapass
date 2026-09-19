import { redirect } from "next/navigation";

/**
 * ポータル一覧。super_admin は全ポータル+新規発行、portal_admin は担当ポータルのみ。
 */
export default function LegacyPortalsPage() {
  redirect("/admin#portals");
}
