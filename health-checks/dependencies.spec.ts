import { test, expect } from "@playwright/test";

/**
 * 外部依存(データベース・生成AI・地図タイル・ジオコーダ)の死活監視。
 *
 * main-links.spec.ts はページが開けるかしか見ないため、「画面は出るが裏の外部サービスが
 * 死んでいる」故障を拾えない。実際、Geminiのモデル提供終了で身分証OCRが動かなくなって
 * いたのに気付けなかった(2026-09-13)。判定は /api/health に集約してある。
 */
test("external dependencies are healthy", async ({ request }) => {
  const response = await request.get("/api/health");

  // エンドポイント自体が無い/HTMLが返る場合は、JSON解析で落ちる前に理由を出す。
  const contentType = response.headers()["content-type"] ?? "";
  expect(
    contentType.includes("application/json"),
    `/api/health returned ${response.status()} (${contentType || "no content-type"})`,
  ).toBe(true);

  const body = (await response.json()) as {
    ok: boolean;
    checks: { name: string; ok: boolean; ms: number; detail?: string }[];
  };

  const failed = body.checks.filter((c) => !c.ok);
  const summary = body.checks.map((c) => `${c.name}=${c.ok ? "ok" : `NG(${c.detail})`} ${c.ms}ms`).join(", ");

  expect(failed.map((c) => `${c.name}: ${c.detail}`).join(" / "), summary).toBe("");
  expect(response.status(), summary).toBe(200);
});
