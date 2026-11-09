import { redirect } from "next/navigation";

/** 旧URL(/admin/threads)は、SNS自動投稿(/admin/social)に移った。ブックマークが切れないように残している。 */
export default function LegacyThreadsAdminRedirect() {
  redirect("/admin/social");
}
