import { NextRequest, NextResponse } from "next/server";
import { isAllowedSource, resizeFromUrl } from "@/lib/images/resizeSource";

export const runtime = "nodejs";

const CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Supabase Storageの画像を縮小して返す(/api/img?u=元URL&w=幅&h=高さ&fit=cover|contain&q=画質)。
 * 同じURLへのリクエストはCDNが1年保存するので、縮小は1つの画像につき基本1回だけ。
 * 縮小できなかったときは元の画像へ転送する(画像が出なくなるよりは重くても出す)。
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const src = sp.get("u") ?? "";
  if (!isAllowedSource(src)) return new NextResponse("bad source", { status: 400 });

  const width = clamp(Number(sp.get("w")) || 0, 16, 2400);
  const hRaw = Number(sp.get("h")) || 0;
  const height = hRaw ? clamp(hRaw, 16, 6000) : undefined;
  const fit = sp.get("fit") === "contain" ? "contain" : "cover";
  const quality = clamp(Number(sp.get("q")) || 70, 40, 90);

  const format = sp.get("f") === "jpeg" ? "jpeg" : "webp";
  const out = await resizeFromUrl(src, { width, height, fit, quality, format });
  if (!out) {
    return NextResponse.redirect(src, { status: 302, headers: { "Cache-Control": "public, max-age=300" } });
  }
  return new NextResponse(new Uint8Array(out.data), {
    headers: { "Content-Type": out.contentType, "Cache-Control": CACHE },
  });
}
