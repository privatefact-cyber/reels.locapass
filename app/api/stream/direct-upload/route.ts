import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_STREAM_API_TOKEN;
  if (!accountId || !token) return NextResponse.json({ error: "Cloudflare Stream is not configured" }, { status: 503 });
  const { name } = await request.json().catch(() => ({}));
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ maxDurationSeconds: 30, expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(), meta: { name: String(name ?? "reel"), uploadedBy: user.id } }),
  });
  const body = await response.json();
  if (!response.ok || !body.success) return NextResponse.json({ error: body.errors?.[0]?.message ?? "Could not create Stream upload" }, { status: 502 });
  return NextResponse.json({ uploadURL: body.result.uploadURL, uid: body.result.uid });
}
