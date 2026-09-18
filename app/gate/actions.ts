"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "luxela_preview_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 1日

function safeNext(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("/gate") ? raw : "/";
}

export async function verifyPasscode(formData: FormData) {
  const pass = String(formData.get("passcode") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));
  const expected = process.env.PREVIEW_PASSCODE ?? "777";

  if (pass !== expected) {
    redirect(`/gate?next=${encodeURIComponent(next)}&error=1`);
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  redirect(next);
}
