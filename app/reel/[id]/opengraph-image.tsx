import { ImageResponse } from "next/og";
import { getReelById } from "@/lib/reels/getReelById";
import { loadFont, loadPhoto } from "@/lib/og/cardAssets";

export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "LOCAPASS";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reel = await getReelById(id);
  const name = reel?.shopName ?? "LOCAPASS";
  const media = reel?.media[0];
  const thumb = media ? (media.type === "video" ? media.poster : media.url) : null;
  const font = await loadFont(`${name}LOCAPASS`);
  const photo = thumb ? await loadPhoto(thumb) : null;
  // フォントが取れなかったときは、文字化け(□)を避けて英数字だけにする。
  const title = font ? name : name.replace(/[^\x20-\x7e]/g, "").trim() || "LOCAPASS";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#111", fontFamily: font ? "NotoSansJP" : "sans-serif" }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }} />
        ) : null}
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.1) 100%)" }} />
        <div style={{ position: "absolute", top: 36, left: 48, display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: 10, color: "#fcd34d" }}>LOCAPASS</div>
        <div style={{ position: "absolute", left: 48, right: 48, bottom: 44, display: "flex", fontSize: 68, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
          {title}
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "NotoSansJP", data: font, weight: 700, style: "normal" }] : undefined },
  );
}
