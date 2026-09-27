/**
 * 街の声: 店舗が運営に直接連携した公式SNSアカウント(Instagram/Facebook/Threads)の投稿を
 * 検索エンジン経由ではなく各社のAPIで直接取得する。
 *
 * Google検索グラウンディング(investigate()内)はSNS内部の投稿本文まではほとんど拾えない
 * (2026-09時点でInstagram・Facebook・Threadsはクローラーをブロックしており、検索結果に
 * 投稿本文が出てこないことが多い)。そこで、運営がAPI連携済みのアカウントについてだけ、
 * ここで実際の投稿本文をAPI経由で取得し、investigate()の生データに「本人発信・信頼性高」
 * として混ぜ込む。連携していない店舗は従来どおり検索グラウンディングのみで調べる。
 *
 * 対応状況(2026-09-27時点):
 *   - Instagram: 対応。Instagram API with Instagram Login(graph.instagram.com、IGAA〜トークン)。
 *   - Facebook / Threads: 未対応。同じMeta社でも、InstagramのトークンとFacebook/Threadsの
 *     トークンは別物(別アプリ・別OAuth・別の審査)で、自動的には共有されない。
 *     取得できたトークンをOFFICIAL_SNS_ACCOUNTSに追加し、下のfetchOfficialSnsPostsの
 *     switch文にfetchFacebookPosts/fetchThreadsPostsを足すだけで有効になる(呼び出し側の
 *     investigate()は変更不要)。
 *
 * 設定方法(.env.local、両サイト共通):
 *   OFFICIAL_SNS_ACCOUNTS を JSON配列の文字列で1行に設定する。例:
 *   [{"handle":"lizlisafamily","platform":"instagram","accountId":"17841439272805497","accessToken":"IGAA..."}]
 *   handle は店舗の sns_links.instagram / sns_links.facebook / sns_links.threads に入っている
 *   URLや@表記から突き合わせる(大文字小文字・URL形式の違いは正規化して比較する)。
 */

export type SnsPlatform = "instagram" | "facebook" | "threads";

export type OfficialSnsAccount = {
  /** 店舗のsns_linksと突き合わせるハンドル(@や URL は無くてよい。例: "lizlisafamily") */
  handle: string;
  platform: SnsPlatform;
  /** IGビジネスアカウントID / FBページID / Threadsユーザーidなど、API呼び出しに使うID */
  accountId: string;
  accessToken: string;
};

export type OfficialSnsPost = {
  platform: SnsPlatform;
  text: string;
  permalink: string | null;
  timestamp: string | null;
};

let cachedAccounts: OfficialSnsAccount[] | null = null;

function loadAccounts(): OfficialSnsAccount[] {
  if (cachedAccounts) return cachedAccounts;
  const raw = process.env.OFFICIAL_SNS_ACCOUNTS;
  if (!raw || !raw.trim()) {
    cachedAccounts = [];
    return cachedAccounts;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("配列ではありません");
    cachedAccounts = parsed.filter(
      (a): a is OfficialSnsAccount =>
        a &&
        typeof a.handle === "string" &&
        typeof a.accountId === "string" &&
        typeof a.accessToken === "string" &&
        (a.platform === "instagram" || a.platform === "facebook" || a.platform === "threads"),
    );
  } catch (err) {
    console.error("OFFICIAL_SNS_ACCOUNTS のJSON解析に失敗しました。街の声の公式SNS連携はスキップします。", err);
    cachedAccounts = [];
  }
  return cachedAccounts;
}

/** "https://instagram.com/lizlisafamily/" や "@lizlisafamily" からハンドルだけを取り出して比較用に正規化する。 */
function normalizeHandle(v: string): string {
  return v
    .trim()
    .replace(/^@/u, "")
    .replace(/^https?:\/\/(www\.)?(instagram\.com|threads\.net|facebook\.com)\//iu, "")
    .replace(/[/?#].*$/u, "")
    .toLowerCase();
}

function findAccount(snsLinks: unknown, platform: SnsPlatform): OfficialSnsAccount | null {
  if (!snsLinks || typeof snsLinks !== "object" || Array.isArray(snsLinks)) return null;
  const v = (snsLinks as Record<string, unknown>)[platform];
  if (typeof v !== "string" || !v.trim()) return null;
  const handle = normalizeHandle(v);
  if (!handle) return null;
  return loadAccounts().find((a) => a.platform === platform && normalizeHandle(a.handle) === handle) ?? null;
}

async function fetchInstagramPosts(account: OfficialSnsAccount): Promise<OfficialSnsPost[]> {
  const url = `https://graph.instagram.com/v21.0/${account.accountId}/media?fields=caption,media_type,permalink,timestamp&limit=25&access_token=${encodeURIComponent(account.accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("instagram graph api fetch failed", res.status, (await res.text()).slice(0, 300));
    return [];
  }
  const data = await res.json();
  const items: unknown[] = Array.isArray(data?.data) ? data.data : [];
  return items
    .map((it) => it as { caption?: unknown; permalink?: unknown; timestamp?: unknown })
    .filter((it): it is { caption: string; permalink?: unknown; timestamp?: unknown } => typeof it.caption === "string" && it.caption.trim().length > 0)
    .map((it) => ({
      platform: "instagram" as const,
      text: it.caption.trim(),
      permalink: typeof it.permalink === "string" ? it.permalink : null,
      timestamp: typeof it.timestamp === "string" ? it.timestamp : null,
    }));
}

// Facebook / Threads用のトークンが用意でき次第、fetchFacebookPosts / fetchThreadsPosts をここに追加し、
// 下のswitch文に1行足すだけでよい(呼び出し側のinvestigate()は変更不要)。

/** 店舗のsns_linksに、運営がAPI連携済みのアカウント(Instagram/Facebook/Threads)があれば実際の投稿を取得する。 */
export async function fetchOfficialSnsPosts(snsLinks: unknown): Promise<OfficialSnsPost[]> {
  const platforms: SnsPlatform[] = ["instagram", "facebook", "threads"];
  const results: OfficialSnsPost[] = [];
  for (const platform of platforms) {
    const account = findAccount(snsLinks, platform);
    if (!account) continue;
    try {
      switch (platform) {
        case "instagram":
          results.push(...(await fetchInstagramPosts(account)));
          break;
        case "facebook":
        case "threads":
          // 未対応(上記コメント参照)。account はあってもトークンが無いのでスキップ。
          break;
      }
    } catch (err) {
      console.error(`${platform} の公式SNS投稿取得に失敗`, err);
    }
  }
  return results;
}
