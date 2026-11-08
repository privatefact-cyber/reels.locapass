import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractEmail, type InquiryType } from "@/lib/lpInquiry/shared";

export const dynamic = "force-dynamic";

/** 同じ人からの連投を防ぐ。1時間あたりの受付数の上限。 */
const MAX_PER_HOUR = 5;

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function ipHash(req: Request): string | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  if (!ip) return null;
  // IPアドレスそのものは保存しない。連投の判定にだけ使うハッシュ(サーバーの秘密を混ぜる)。
  const salt = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").slice(-16);
  return createHash("sha256").update(`${ip}:${salt}:lp-inquiry`).digest("hex");
}

/**
 * LP(/lp/shop, /lp/agency)の問い合わせフォームの受付。locapass_lp_inquiries に「新規」で保存する。
 * 管理画面(/admin/inquiries)で、状態の確認と返信ができる。
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  // ボット対策(フォームの見えない欄に入力があれば、受け付けたふりをして捨てる)。
  if (clip(body.website, 200)) return NextResponse.json({ ok: true });

  const type: InquiryType | null = body.type === "shop" ? "shop" : body.type === "agency" ? "agency" : null;
  if (!type) return NextResponse.json({ error: "invalid_type" }, { status: 400 });

  const name = clip(body.name, 80);
  const area = clip(body.area, 120);
  const note = clip(body.note, 3000);
  let subject: string;
  let contact: string;
  const details: Record<string, string> = {};
  if (type === "shop") {
    subject = clip(body.shop, 120);
    contact = clip(body.contact, 160);
    const genre = clip(body.genre, 80);
    const url = clip(body.url, 300);
    if (genre) details.genre = genre;
    if (url) details.url = url;
  } else {
    subject = clip(body.company, 120);
    const email = clip(body.email, 160);
    const tel = clip(body.tel, 40);
    contact = email || tel;
    const biz = clip(body.biz, 120);
    const description = clip(body.description, 1000);
    if (tel && email) details.tel = tel;
    if (biz) details.biz = biz;
    if (description) details.description = description;
  }
  if (!subject || !name || !contact) return NextResponse.json({ error: "missing" }, { status: 400 });

  const admin = createAdminClient() as any;
  const hash = ipHash(req);
  if (hash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin.from("locapass_lp_inquiries").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_HOUR) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { error } = await admin.from("locapass_lp_inquiries").insert({
    type,
    subject,
    name,
    contact,
    email: extractEmail(contact),
    area: area || null,
    details,
    note: note || null,
    source_page: clip(body.page, 300) || null,
    ip_hash: hash,
  });
  if (error) {
    console.error("LPお問い合わせの保存に失敗しました", error.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
