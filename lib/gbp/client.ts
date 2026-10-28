// Googleビジネスプロフィール(Business Information API)への書き込み。
// 運営のGoogleアカウント1つのリフレッシュトークンで、そのアカウントが管理者の全店舗を更新する(代行運用)。
// 環境変数が揃っていなければ「未接続」とみなし、呼び出し側は送信せず内容の確認(dry run)だけを行う。
//   GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN
// ※ Business Profile APIは利用申請の承認が必要。承認前は上記を設定しないこと。

export function gbpConfigured(): boolean {
  return !!(process.env.GBP_CLIENT_ID && process.env.GBP_CLIENT_SECRET && process.env.GBP_REFRESH_TOKEN);
}

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GBP_CLIENT_ID!,
      client_secret: process.env.GBP_CLIENT_SECRET!,
      refresh_token: process.env.GBP_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Googleの認証に失敗しました: ${json.error_description ?? res.status}`);
  return json.access_token;
}

/** locations/{id} を部分更新する。失敗したらGoogleのエラー文言つきで例外を投げる */
export async function patchLocation(locationId: string, location: Record<string, unknown>, updateMask: string): Promise<void> {
  const name = locationId.startsWith("locations/") ? locationId : `locations/${locationId}`;
  const token = await accessToken();
  const res = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${name}?updateMask=${encodeURIComponent(updateMask)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(location),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Googleへの送信に失敗しました(${res.status}): ${body.error?.message ?? "不明なエラー"}`);
  }
}

// ── 口コミ・写真・最新情報(Business Profileの旧v4 API) ─────────────────────────────
// 位置づけ: 営業時間などはBusiness Information API(上のpatchLocation)、口コミ・写真・投稿はv4 APIを使う。
// 接続前(承認前)は実際には呼ばれない。承認後の最初の1店舗で、必ず実機確認すること。
const V4 = "https://mybusiness.googleapis.com/v4";

async function gapi<T>(method: "GET" | "POST" | "PUT", url: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Googleとの通信に失敗しました(${res.status}): ${json.error?.message ?? "不明なエラー"}`);
  return json;
}

const locName = (id: string) => (id.startsWith("locations/") ? id : `locations/${id}`);

/** ロケーションIDから、それを管理しているアカウント(accounts/数字)を探す。見つからなければ例外 */
export async function resolveAccountName(locationId: string): Promise<string> {
  const want = locName(locationId);
  const { accounts = [] } = await gapi<{ accounts?: { name: string }[] }>(
    "GET",
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
  );
  for (const a of accounts.slice(0, 20)) {
    const { locations = [] } = await gapi<{ locations?: { name: string }[] }>(
      "GET",
      `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name&pageSize=100`,
    );
    if (locations.some((l) => l.name === want)) return a.name;
  }
  throw new Error("このロケーションを管理しているアカウントが見つかりません(管理者として招待済みか確認してください)");
}

export type GbpReview = {
  reviewId: string;
  reviewerName: string | null;
  starRating: number | null;
  comment: string | null;
  createTime: string | null;
  updateTime: string | null;
  replyComment: string | null;
  replyUpdateTime: string | null;
};

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** 新しい順に最大50件の口コミ */
export async function listReviews(accountName: string, locationId: string): Promise<GbpReview[]> {
  const { reviews = [] } = await gapi<{
    reviews?: {
      reviewId: string;
      reviewer?: { displayName?: string };
      starRating?: string;
      comment?: string;
      createTime?: string;
      updateTime?: string;
      reviewReply?: { comment?: string; updateTime?: string };
    }[];
  }>("GET", `${V4}/${accountName}/${locName(locationId)}/reviews?pageSize=50&orderBy=${encodeURIComponent("updateTime desc")}`);
  return reviews.map((r) => ({
    reviewId: r.reviewId,
    reviewerName: r.reviewer?.displayName ?? null,
    starRating: STARS[r.starRating ?? ""] ?? null,
    comment: r.comment ?? null,
    createTime: r.createTime ?? null,
    updateTime: r.updateTime ?? null,
    replyComment: r.reviewReply?.comment ?? null,
    replyUpdateTime: r.reviewReply?.updateTime ?? null,
  }));
}

/** 口コミに、お店として返信する(すでに返信があれば上書き)。公開される */
export async function replyToReview(accountName: string, locationId: string, reviewId: string, comment: string): Promise<void> {
  await gapi("PUT", `${V4}/${accountName}/${locName(locationId)}/reviews/${encodeURIComponent(reviewId)}/reply`, { comment });
}

/** 写真を1枚アップロード(GoogleがsourceUrlを取りに来る。公開URLであること) */
export async function uploadPhoto(accountName: string, locationId: string, sourceUrl: string): Promise<string | null> {
  const r = await gapi<{ name?: string }>("POST", `${V4}/${accountName}/${locName(locationId)}/media`, {
    mediaFormat: "PHOTO",
    locationAssociation: { category: "ADDITIONAL" },
    sourceUrl,
  });
  return r.name ?? null;
}

/** 「最新情報」の投稿(標準タイプ) */
export async function createLocalPost(
  accountName: string,
  locationId: string,
  post: { summary: string; linkUrl?: string | null; photoUrl?: string | null },
): Promise<string | null> {
  const r = await gapi<{ name?: string }>("POST", `${V4}/${accountName}/${locName(locationId)}/localPosts`, {
    languageCode: "ja",
    topicType: "STANDARD",
    summary: post.summary,
    ...(post.linkUrl ? { callToAction: { actionType: "LEARN_MORE", url: post.linkUrl } } : {}),
    ...(post.photoUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl: post.photoUrl }] } : {}),
  });
  return r.name ?? null;
}
