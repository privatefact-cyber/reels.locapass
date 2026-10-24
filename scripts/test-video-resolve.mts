// 実行: npx tsx scripts/test-video-resolve.mts (短縮URLをたどる処理の確認。模擬サーバーを使い、外部にはアクセスしない)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { isShortVideoUrl, expandShortVideoUrl, parseVideoUrlWithShortLinks } from "../lib/video-resolve";
import { parseVideoUrl } from "../lib/video";

// 1. 短縮URLの判定
assert.equal(isShortVideoUrl("https://vm.tiktok.com/ZMabc123/"), true);
assert.equal(isShortVideoUrl("https://vt.tiktok.com/ZSabc123/"), true);
assert.equal(isShortVideoUrl("https://www.tiktok.com/t/ZTabc123/"), true);
assert.equal(isShortVideoUrl("https://www.instagram.com/share/reel/BAbcDef/"), true);
assert.equal(isShortVideoUrl("https://www.tiktok.com/@user/video/7412345678901234567"), false);
assert.equal(isShortVideoUrl("https://www.youtube.com/watch?v=tX6tzc6YO_M"), false);
// 2. 直接のURLは、そのまま判別。Instagramのshareは、展開前は判別しない(誤ったコードを保存しない)
assert.deepEqual(parseVideoUrl("https://www.tiktok.com/@user/video/7412345678901234567?_r=1"), { provider: "tiktok", ref: "7412345678901234567" });
assert.equal(parseVideoUrl("https://www.instagram.com/share/reel/BAbcDef/"), null);
assert.deepEqual(parseVideoUrl("https://www.instagram.com/reel/CxYz123abc/"), { provider: "instagram", ref: "reel/CxYz123abc" });

// 3. リダイレクトをたどる(模擬サーバー。許可ホストは、テストのためにlocalhostを許す)
const srv = createServer((req, res) => {
  if (req.url === "/tt") { res.writeHead(301, { Location: "/hop2" }); return res.end(); }
  if (req.url === "/hop2") { res.writeHead(302, { Location: "https://www.tiktok.com/@shop/video/7412345678901234567?_r=1&u_code=x" }); return res.end(); }
  if (req.url === "/ig") { res.writeHead(302, { Location: "https://www.instagram.com/reel/CxYz123abc/?igsh=zzz" }); return res.end(); }
  if (req.url === "/page") { res.writeHead(200, { "content-type": "text/html" }); return res.end('<html><head><link rel="canonical" href="https://www.tiktok.com/@shop/video/7499999999999999999"></head></html>'); }
  if (req.url === "/loop") { res.writeHead(302, { Location: "/loop" }); return res.end(); }
  if (req.url === "/evil") { res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" }); return res.end(); }
  res.writeHead(404); res.end();
});
await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(srv.address() as any).port}`;
// 本来は vm.tiktok.com 宛てのリクエストを、模擬サーバーに差し替える
const mockFetch = ((url: string, init: any) => fetch(String(url).replace(/^https?:\/\/[^/]+/, base).replace(/^(.*)\/ZM.*$/, "$1/tt"), init)) as typeof fetch;
const allowAll = () => true;
assert.deepEqual(await parseVideoUrlWithShortLinks("https://vm.tiktok.com/ZMabc123/", { fetchImpl: mockFetch, allowedHost: allowAll }), { provider: "tiktok", ref: "7412345678901234567" });
const igFetch = ((url: string, init: any) => fetch(base + "/ig", init)) as typeof fetch;
assert.deepEqual(await parseVideoUrlWithShortLinks("https://www.instagram.com/share/reel/BAbcDef/", { fetchImpl: igFetch, allowedHost: allowAll }), { provider: "instagram", ref: "reel/CxYz123abc" });
const pageFetch = ((url: string, init: any) => fetch(base + "/page", init)) as typeof fetch;
assert.deepEqual(await parseVideoUrlWithShortLinks("https://vm.tiktok.com/ZMpage/", { fetchImpl: pageFetch, allowedHost: allowAll }), { provider: "tiktok", ref: "7499999999999999999" });
// 4. 失敗は、nullを返す(無限ループ・許可外のホスト・通信失敗)
const loopFetch = ((url: string, init: any) => fetch(base + "/loop", init)) as typeof fetch;
assert.equal(await parseVideoUrlWithShortLinks("https://vm.tiktok.com/ZMloop/", { fetchImpl: loopFetch, allowedHost: allowAll }), null);
const evilFetch = ((url: string, init: any) => fetch(base + "/evil", init)) as typeof fetch;
let evilRequests = 0;
const countingFetch = ((url: string, init: any) => { evilRequests++; return evilFetch(url, init); }) as typeof fetch;
assert.equal(await parseVideoUrlWithShortLinks("https://vm.tiktok.com/ZMevil/", { fetchImpl: countingFetch }), null);
assert.equal(evilRequests, 1, "許可外のホスト(169.254.…)には、リクエストしない");
const failFetch = (() => Promise.reject(new Error("net"))) as typeof fetch;
assert.equal(await parseVideoUrlWithShortLinks("https://vm.tiktok.com/ZMnet/", { fetchImpl: failFetch, allowedHost: allowAll }), null);
srv.close();
console.log("video-resolve: すべて通りました");
