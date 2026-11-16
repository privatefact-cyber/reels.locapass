import crypto from "node:crypto";
import http2 from "node:http2";
// locapass_apns_tokens は型生成(types/supabase.ts)にまだ無いので、型なしのクライアントを使う
import { petAdmin } from "@/lib/pet/db";

/**
 * ロカわんのiPhoneアプリへのプッシュ通知(APNs)。トークン方式(AppleのAPNs認証キー .p8)。
 * 環境変数が無い環境では何もしない:
 *   APNS_KEY_P8   .p8 ファイルの中身(-----BEGIN PRIVATE KEY----- ... )。改行が \n になっていてもよい
 *   APNS_KEY_ID   キーID(10文字)
 *   APNS_TEAM_ID  チームID(既定 7D746B5DRM)
 *   APNS_BUNDLE_ID  アプリのBundle ID(既定 net.locapass.pet)
 */
const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;
type Env = keyof typeof HOSTS;

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID);
}

let cachedJwt: { token: string; at: number } | null = null;
function providerToken(): string {
  // Appleは同じトークンを20分〜60分で更新するよう求めている。50分ごとに作り直す
  if (cachedJwt && Date.now() - cachedJwt.at < 50 * 60_000) return cachedJwt.token;
  const key = (process.env.APNS_KEY_P8 ?? "").replace(/\\n/g, "\n");
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = b64({ alg: "ES256", kid: process.env.APNS_KEY_ID });
  const body = b64({ iss: process.env.APNS_TEAM_ID || "7D746B5DRM", iat: Math.floor(Date.now() / 1000) });
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  const token = `${head}.${body}.${sig}`;
  cachedJwt = { token, at: Date.now() };
  return token;
}

type ApnsResult = { status: number; reason?: string };

function sendOne(env: Env, deviceToken: string, payload: object): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const client = http2.connect(HOSTS[env]);
    const done = (r: ApnsResult) => {
      client.close();
      resolve(r);
    };
    client.on("error", () => done({ status: 0, reason: "connect_error" }));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      "apns-topic": process.env.APNS_BUNDLE_ID || "net.locapass.pet",
      "apns-push-type": "alert",
      "apns-priority": "10",
    });
    let status = 0;
    let data = "";
    req.setEncoding("utf8");
    req.on("response", (h) => (status = Number(h[":status"] ?? 0)));
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      let reason: string | undefined;
      try {
        reason = data ? (JSON.parse(data) as { reason?: string }).reason : undefined;
      } catch {
        reason = undefined;
      }
      done({ status, reason });
    });
    req.on("error", () => done({ status: 0, reason: "request_error" }));
    req.setTimeout(10_000, () => {
      req.close();
      done({ status: 0, reason: "timeout" });
    });
    req.end(JSON.stringify(payload));
  });
}

/**
 * 指定ユーザーのiPhoneアプリ(登録済みの端末)に通知を送る。
 * 送り先(本番/開発)は、前回通ったほうを覚えておき、なければ本番→開発の順に試す。
 * 端末が登録解除されている(410 / Unregistered / BadDeviceToken)トークンは、その場で消す。
 */
export async function sendApnsToUser(userId: string, n: { title: string; body: string; url: string }): Promise<void> {
  if (!apnsConfigured()) return;
  const admin = petAdmin();
  const { data: rows } = await admin.from("locapass_apns_tokens").select("id, token, environment").eq("user_id", userId);
  if (!rows?.length) return;
  const payload = { aps: { alert: { title: n.title, body: n.body }, sound: "default" }, url: n.url };

  await Promise.all(
    rows.map(async (row) => {
      const order: Env[] = row.environment === "sandbox" ? ["sandbox", "production"] : ["production", "sandbox"];
      for (const env of order) {
        const res = await sendOne(env, row.token as string, payload);
        if (res.status === 200) {
          if (row.environment !== env) await admin.from("locapass_apns_tokens").update({ environment: env }).eq("id", row.id);
          return;
        }
        // 送り先の種類が違うだけなら、もう一方で試す
        if (res.status === 400 && res.reason === "BadDeviceToken") continue;
        if (res.status === 410 || res.reason === "Unregistered") {
          await admin.from("locapass_apns_tokens").delete().eq("id", row.id);
          return;
        }
        console.error("[apns] send failed", res.status, res.reason);
        return;
      }
      // 本番・開発のどちらでも受け付けない = 使えないトークン
      await admin.from("locapass_apns_tokens").delete().eq("id", row.id);
    }),
  );
}
