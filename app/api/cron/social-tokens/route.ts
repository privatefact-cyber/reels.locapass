import { NextResponse } from "next/server";
import { refreshSocialTokens } from "@/lib/social/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Instagram / Threads のトークンを、期限前に自動で延長する(vercel.json の crons から、毎日1回)。詳細は lib/social/tokens.ts。 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const results = await refreshSocialTokens();
    // 発行から24時間以内の延長失敗は想定内なので、502にはしない。
    return NextResponse.json({ results });
  } catch (error) {
    console.error("SNSトークンの延長に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "token refresh failed" }, { status: 502 });
  }
}
