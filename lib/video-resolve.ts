import { parseVideoUrl, type VideoRef } from "@/lib/video";

/**
 * スマホの「共有 → リンクをコピー」で出る短縮URL(TikTok の vm.tiktok.com / vt.tiktok.com / tiktok.com/t/…、
 * Instagram の instagram.com/share/…)は、動画の識別子がURLに入っていない。
 * 保存するときだけ、サーバー側でリダイレクトをたどって、本来のURLに直してから判別する。
 * (SSRF対策: たどる先は TikTok / Instagram のドメインだけ。ホップ数・時間・読む量に上限。)
 */
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAX_HOPS = 5;
const TIMEOUT_MS = 6000;

const defaultAllowedHost = (host: string) => host === "tiktok.com" || host.endsWith(".tiktok.com") || host === "instagram.com" || host.endsWith(".instagram.com");

function normalizeHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
}

/** 短縮URL(動画の識別子が入っていない共有リンク)かどうか。 */
export function isShortVideoUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return false;
  }
  const host = normalizeHost(url);
  const first = url.pathname.split("/").filter(Boolean)[0];
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return true;
  if (host === "tiktok.com" && first === "t") return true;
  if (host === "instagram.com" && first === "share") return true;
  return false;
}

type Options = { fetchImpl?: typeof fetch; allowedHost?: (host: string) => boolean };

/** 短縮URLなら、本来のURLにたどって返す。たどれなければ、入力をそのまま返す。 */
export async function expandShortVideoUrl(input: string, opts: Options = {}): Promise<string> {
  if (!isShortVideoUrl(input)) return input;
  const doFetch = opts.fetchImpl ?? fetch;
  const allowed = opts.allowedHost ?? defaultAllowedHost;
  let current = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!allowed(current.hostname.toLowerCase())) return input;
    let res: Response;
    try {
      res = await doFetch(current.toString(), {
        redirect: "manual",
        headers: { "User-Agent": BROWSER_UA, "Accept-Language": "ja,en;q=0.8" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return input;
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      try {
        current = new URL(location, current);
      } catch {
        return input;
      }
      // 動画の識別子が見えたら、そこで終わり
      if (parseVideoUrl(current.toString())) return current.toString();
      continue;
    }
    // リダイレクトではなく、ページが返ってきた場合: canonical / og:url に本来のURLがあれば使う(読む量は先頭だけ)。
    if (res.ok) {
      try {
        const html = (await res.text()).slice(0, 300_000);
        const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
        if (m && parseVideoUrl(m[1])) return m[1];
      } catch {
        /* 読めなければ諦める */
      }
    }
    return parseVideoUrl(current.toString()) ? current.toString() : input;
  }
  return input;
}

/** 貼られたURL(短縮URLも含む)から、動画の (サイト, 識別子) を判別する。 */
export async function parseVideoUrlWithShortLinks(input: string, opts: Options = {}): Promise<VideoRef | null> {
  const direct = parseVideoUrl(input);
  if (direct) return direct;
  const expanded = await expandShortVideoUrl(input, opts);
  return expanded === input ? null : parseVideoUrl(expanded);
}
