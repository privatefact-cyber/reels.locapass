import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles, hasManagementRole, homePathForRoles, MODE_COOKIE } from "@/lib/auth/roles";

/**
 * 立場の切り替え(?to=personal|manage)。選んだ立場をCookieに覚えて、その画面へ移動する。
 * 管理側の立場を持たないアカウントが ?to=manage で来ても、マイページへ戻す。
 */
export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get("to") === "manage" ? "manage" : "personal";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  let destination = "/mypage";
  let mode: "personal" | "manage" = "personal";
  if (to === "manage") {
    const roles = await fetchMyRoles(supabase);
    if (roles && hasManagementRole(roles)) {
      destination = homePathForRoles(roles);
      mode = "manage";
    }
  }

  const res = NextResponse.redirect(new URL(destination, request.url));
  res.cookies.set(MODE_COOKIE, mode, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  return res;
}
