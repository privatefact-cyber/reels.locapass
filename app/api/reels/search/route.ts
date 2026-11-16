import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/reels/search/embed";
import { queryTerms } from "@/lib/reels/search";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_Q = 80;
const MAX_IDS = 1500;
/** 質問文との意味の近さの足切り。これ未満で、言葉も含まれない動画は「合わない」とみなす。 */
const MIN_SIM = Number(process.env.REEL_SEARCH_MIN_SIM ?? 0.66);

// 簡易な連打対策(サーバーレスのため端末・インスタンスごとの目安)。質問文の意味化にAIを1回使うので、念のため。
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > 30;
}

/**
 * リールの文章検索(「猫の動画」「雨の日の店内」など)。
 * body: { q: string, ids: string[] }  ids = いま画面に出ている動画のID。その範囲の中だけで探す。
 * 返すのは合うリールのID(言葉が含まれるものを先に、近い順)。見える範囲はリールのRLSに従う(下書きは持ち主だけ)。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { q?: unknown; ids?: unknown; minSim?: unknown } | null;
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, MAX_Q) : "";
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, MAX_IDS) : [];
  if (!q || ids.length === 0) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const terms = queryTerms(q);
  let embedding: number[] | null = null;
  try {
    // 「の動画」などを落とした言葉で意味化する(「動画」が混ざると、どの動画にも少し近くなってしまう)。
    embedding = await embedText(terms.length > 0 ? terms.join(" ") : q, "RETRIEVAL_QUERY");
  } catch (e) {
    // 意味検索が使えなくても、言葉が含まれる動画だけは返す。
    console.error("[reel-search] embed failed", e);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("locapass_search_reels" as never, {
    p_ids: ids,
    p_embedding: embedding ? `[${embedding.join(",")}]` : null,
    p_terms: terms,
    p_min_sim: process.env.NODE_ENV !== "production" && typeof body?.minSim === "number" ? body.minSim : MIN_SIM,
    p_limit: 500,
  } as never);
  if (error) {
    console.error("[reel-search] rpc failed", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const rows = (data ?? []) as { reel_id: string; sim: number; kw: boolean }[];
  return NextResponse.json({
    ids: rows.map((r) => r.reel_id),
    // 画面に出す「解釈したキーワード」(質問文から余計な言葉を除いたもの)。
    terms,
    // 足切りの調整用(本番では返さない)。
    ...(process.env.NODE_ENV !== "production" ? { scores: rows.map((r) => ({ id: r.reel_id.slice(0, 8), sim: Number(r.sim.toFixed(3)), kw: r.kw })) } : {}),
  });
}
