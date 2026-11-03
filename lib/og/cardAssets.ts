import { isAllowedSource, resizeFromUrl } from "@/lib/images/resizeSource";

/** 日本語を含む文字だけを切り出した Noto Sans JP を Google Fonts から取る(失敗したら null → 英数字だけで描く)。 */
export async function loadFont(text: string): Promise<ArrayBuffer | null> {
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

/** 画像を横長(1200x630)に切り抜いてdata URLにする。自前の縮小処理を使う(Supabaseの画像変換は枚数課金のため使わない)。 */
export async function loadPhoto(url: string): Promise<string | null> {
  try {
    if (isAllowedSource(url)) {
      const out = await resizeFromUrl(url, { width: 1200, height: 630, fit: "cover", quality: 80, format: "jpeg" });
      return out ? `data:${out.contentType};base64,${out.data.toString("base64")}` : null;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(jpeg|png)/.test(type)) return null; // satoriはwebpを読めない
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}
