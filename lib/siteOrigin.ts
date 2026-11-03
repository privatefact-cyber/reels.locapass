/** 共有URLなど、外に出すURLの正規ドメイン。vercel.appなど別のホストで開かれていても、共有先にはこちらを渡す。 */
export const SITE_ORIGIN = "https://locapass.net";

/** リール1本の共有URL(/reel/[id])。 */
export function reelShareUrl(reelId: string): string {
  return `${SITE_ORIGIN}/reel/${reelId}`;
}
