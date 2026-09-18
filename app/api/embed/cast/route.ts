import { NextResponse } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";

// 外部サイト(店舗の公式サイト等)に出勤表/キャスト情報を埋め込むための公開API。
// 認証なしの任意ドメインから叩かれる前提のため、cookieに依存しないcreateStaticClient(anonキー)を使い、
// RLS(anon read active shops/cast/schedules)の範囲でしか読めないようにしている。
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const shopCode = new URL(request.url).searchParams.get("shop")?.trim().toUpperCase();

  if (!shopCode) {
    return NextResponse.json(
      { error: "shop query param is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const supabase = createStaticClient();

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, name")
    .eq("shop_code", shopCode)
    .eq("status", "active")
    .maybeSingle();

  if (shopError || !shop) {
    return NextResponse.json(
      { error: "shop not found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: rows, error: castError } = await supabase
    .from("cast_members")
    .select(
      "id, name, age, avatar_url, pr_text, schedules!inner(start_time, end_time, date, is_working_today)",
    )
    .eq("shop_id", shop.id)
    .eq("schedules.date", today)
    .eq("schedules.is_working_today", true);

  if (castError) {
    return NextResponse.json(
      { error: "failed to load casts" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const casts = (rows ?? []).map((row) => {
    const schedule = Array.isArray(row.schedules) ? row.schedules[0] : row.schedules;
    return {
      id: row.id,
      name: row.name,
      age: row.age,
      avatarUrl: row.avatar_url,
      prText: row.pr_text,
      startTime: schedule?.start_time ?? null,
      endTime: schedule?.end_time ?? null,
    };
  });

  return NextResponse.json(
    { shop: { name: shop.name }, date: today, casts },
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
