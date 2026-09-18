import { NextResponse } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { geminiGenerateContentUrl } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 外部依存の死活監視。
 *
 * ページが開けるかだけを見る死活監視(health-checks/main-links.spec.ts)では、
 * 「画面は出るが裏の外部サービスが死んでいる」故障を拾えない。
 * 実際、Geminiのモデル提供終了で身分証OCRが動かなくなっていたのに気付けなかった
 * (2026-09-13)。ここでは各依存を実際に1回叩いて確認する。
 *
 * 応答にはベンダー名を出さない(どのサービスを使っているかを外部に晒さないため)。
 * 失敗時は503を返すので、監視ツールはHTTPステータスだけ見ればよい。
 */

type Check = { name: string; ok: boolean; ms: number; detail?: string };

/** 公開エンドポイントなので、短時間の結果を使い回して連打による外部API消費を抑える。 */
const CACHE_MS = 60_000;
let cached: { at: number; body: { ok: boolean; checks: Check[] } } | null = null;

async function timed(name: string, fn: () => Promise<string | null>): Promise<Check> {
  const started = Date.now();
  try {
    const failure = await fn();
    return { name, ok: failure === null, ms: Date.now() - started, ...(failure ? { detail: failure } : {}) };
  } catch (e) {
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      detail: e instanceof Error ? e.message.slice(0, 120) : "unknown error",
    };
  }
}

/** データベースに届いて、公開中の店舗が読めるか。 */
async function checkDatabase(): Promise<string | null> {
  const supabase = createStaticClient();
  const { error, count } = await supabase
    .from("shops")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (error) return "query failed";
  return (count ?? 0) > 0 ? null : "no active rows";
}

/**
 * 生成AIのモデルが今も呼べるか。
 * モデル情報API(GET models/x)は提供終了後も200を返すので当てにならない。
 * 必ず生成を1回叩く(出力1トークンに絞ってコストを最小化する)。
 */
async function checkAiModel(): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "api key missing";
  const res = await fetch(geminiGenerateContentUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: 1, temperature: 0 },
    }),
  });
  if (res.status === 404) return "model no longer available";
  return res.ok ? null : `status ${res.status}`;
}

/** 地図タイルのスタイル定義が取得できるか。 */
async function checkMapTiles(): Promise<string | null> {
  const res = await fetch("https://tiles.openfreemap.org/styles/dark");
  return res.ok ? null : `status ${res.status}`;
}

/** 住所→座標の変換が生きているか(既知の住所で確認する)。 */
async function checkGeocoder(): Promise<string | null> {
  const res = await fetch(
    `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent("東京都新宿区歌舞伎町2-14-5")}`,
  );
  if (!res.ok) return `status ${res.status}`;
  const hits = (await res.json()) as unknown[];
  return Array.isArray(hits) && hits.length > 0 ? null : "no results";
}

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.body, { status: cached.body.ok ? 200 : 503 });
  }

  const checks = await Promise.all([
    timed("database", checkDatabase),
    timed("ai-model", checkAiModel),
    timed("map-tiles", checkMapTiles),
    timed("geocoder", checkGeocoder),
  ]);

  const body = { ok: checks.every((c) => c.ok), checks };
  cached = { at: Date.now(), body };
  return NextResponse.json(body, { status: body.ok ? 200 : 503 });
}
