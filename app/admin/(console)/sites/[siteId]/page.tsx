import { redirect } from "next/navigation";

// 旧「サイト管理」は「ポータル管理」(/admin/portals/[portalId])に統合した(IDはそのまま)。
export default async function AdminSiteRedirect({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  redirect(`/admin/portals/${siteId}`);
}
