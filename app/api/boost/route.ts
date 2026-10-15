import { NextResponse } from "next/server";
import { getActiveBoosts } from "@/lib/boost/getBoosts";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await getActiveBoosts();
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
