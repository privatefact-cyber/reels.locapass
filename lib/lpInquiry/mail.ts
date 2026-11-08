/**
 * 返信メールの送信(Resend)。RESEND_API_KEY と INQUIRY_FROM_EMAIL が設定されているときだけ送れる。
 * 未設定のときは isMailConfigured() が false になり、管理画面は「メールアプリで開く」「返信済みとして記録」だけを出す。
 * 外部ライブラリは使わず、REST API を直接呼ぶ。
 */
export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.INQUIRY_FROM_EMAIL);
}

export async function sendInquiryMail(input: { to: string; subject: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INQUIRY_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: "メール送信が設定されていません" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, ...(process.env.INQUIRY_REPLY_TO ? { reply_to: process.env.INQUIRY_REPLY_TO } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, error: `メール送信に失敗しました(${res.status}): ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "メール送信に失敗しました" };
  }
}
