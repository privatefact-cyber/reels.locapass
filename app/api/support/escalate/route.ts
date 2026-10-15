import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMyRoles, hasManagementRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/** AIが答えられなかった質問を、運営に送る(返信先は任意)。 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { message?: unknown; contact?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : "";
  const contact = typeof body?.contact === "string" ? body.contact.trim().slice(0, 200) : "";
  if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roles = user ? await fetchMyRoles(supabase) : null;
  const { error } = await (createAdminClient() as any).from("locapass_support_questions").insert({
    question: message,
    answered: false,
    escalated: true,
    contact: contact || (user?.email ?? null),
    audience: hasManagementRole(roles) ? "shop" : "user",
    path: "/support",
  });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
