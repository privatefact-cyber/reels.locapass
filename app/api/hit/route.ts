import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANALYTICS_SITE } from "@/lib/analytics/site";
import { normalizePrefCode } from "@/lib/analytics/prefectures";

// アクセス解析のビーコン受け口。IPは保存せず、Vercelが付ける国・地域ヘッダーだけを使う。
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|httpclient|headless|lighthouse|pingdom|uptime/i;
const done = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return done();

  const body = (await request.json().catch(() => null)) as { p?: string; r?: string } | null;
  if (!body || typeof body.p !== "string" || !body.p.startsWith("/")) return done();
  const path = body.p.split("?")[0].split("#")[0].slice(0, 255);
  if (path.startsWith("/admin") || path.startsWith("/api")) return done();

  // 管理者・運営ログイン中の自分のアクセスは数えない
  if (request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (isAdmin) return done();
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip) return done();
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // JST
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const vid = createHmac("sha256", key).update(`${ip}|${ua}|${day}`).digest("hex").slice(0, 16);

  let refHost = "";
  try {
    if (body.r) {
      const h = new URL(body.r).hostname.replace(/^www\./, "");
      const own = request.nextUrl.hostname.replace(/^www\./, "");
      if (h && h !== own) refHost = h.slice(0, 100);
    }
  } catch {}

  const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? "tablet" : /Mobi|iPhone|iPod|Android/i.test(ua) ? "mobile" : "desktop";
  const country = (request.headers.get("x-vercel-ip-country") ?? "").toUpperCase().slice(0, 2);
  const prefCode = country === "JP" ? normalizePrefCode(request.headers.get("x-vercel-ip-country-region")) : "";

  const supabase = createAdminClient();
  await supabase
    .from("site_hits" as never)
    .insert({ site: ANALYTICS_SITE, day, country, pref_code: prefCode, path, ref_host: refHost, device, vid } as never);
  return done();
}
