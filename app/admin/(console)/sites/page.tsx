import { redirect } from "next/navigation";

// 旧「サイト管理」は「ポータル管理」(/admin/portals)に統合した。
export default function AdminSitesRedirect() {
  redirect("/admin/portals");
}
