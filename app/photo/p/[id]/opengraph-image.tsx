import { ImageResponse } from "next/og";
import { getPhotoPostById } from "@/lib/photo/getPhotoPosts";

export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "LOCA SNAP | LOCAPASS";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 日本語を含む文字だけを切り出した Noto Sans JP を Google Fonts から取る(失敗したら null → 英数字だけで描く)。 */
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`, {
        // 古いブラウザを装うと、woff2ではなくtruetypeで返してくれる(satoriはwoff2を読めない)。
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1" },
      })
    ).text();
    const m = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!m) return null;
    const res = await fetch(m[1]);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** 写真を横長にそろえて(縮小・cover)data URLにする。取れなければnull。 */
async function loadPhoto(url: string): Promise<string | null> {
  try {
    const marker = "/storage/v1/object/public/";
    const src = url.includes(marker)
      ? `${url.replace(marker, "/storage/v1/render/image/public/")}?width=1200&height=630&resize=cover&format=origin`
      : url;
    const res = await fetch(src);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(jpeg|png)/.test(type)) return null; // satoriはwebpを読めない
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = UUID.test(id) ? await getPhotoPostById(id) : null;
  const name = post?.spotName ?? "LOCAPASS";
  const font = await loadFont(`${name}LOCASNAP`);
  const photo = post ? await loadPhoto(post.imageUrl) : null;
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
        <div style={{ position: "absolute", top: 36, left: 48, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: 10, color: "#fcd34d" }}>LOCA SNAP</div>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: "rgba(255,255,255,0.75)" }}>by LOCAPASS</div>
        </div>
        <div style={{ position: "absolute", left: 48, right: 48, bottom: 44, display: "flex", fontSize: 68, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
          {title}
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "NotoSansJP", data: font, weight: 700, style: "normal" }] : undefined },
  );
}
