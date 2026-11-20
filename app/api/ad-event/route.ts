import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 広告枠の表示(imp)とタップ(tap)の受け口。IPは保存しない(日ごとに変わる匿名のvidだけ)。ボットと運営のアクセスは数えない。
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|httpclient|headless|lighthouse|pingdom|uptime/i;
const done = () => new NextResponse(null, { status: 204 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return done();
  const b = (await request.json().catch(() => null)) as { slot?: string; creative?: string; kind?: string; shopId?: string; locale?: string } | null;
  if (!b || (b.slot !== "mid" && b.slot !== "bottom") || (b.kind !== "imp" && b.kind !== "tap")) return done();
  if (typeof b.creative !== "string" || !/^[a-z0-9:_-]{1,80}$/i.test(b.creative)) return done();

  if (request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (isAdmin) return done();
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const vid = ip ? createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(`${ip}|${ua}|${day}`).digest("hex").slice(0, 16) : null;
  const shopId = typeof b.shopId === "string" && UUID.test(b.shopId) ? b.shopId : null;
  const locale = typeof b.locale === "string" ? b.locale.slice(0, 8) : null;

  const supabase = createAdminClient();
  await (supabase as any).from("locapass_ad_events").insert({ day, slot: b.slot, creative: b.creative, kind: b.kind, shop_id: shopId, locale, vid });
  return done();
}
