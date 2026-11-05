"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Cloudflare Turnstile(無料の人間チェック)。ログインなしで通報する人にだけ出す。
 * 鍵が未設定の環境では何も出さない(サーバー側も回数制限だけで受ける)。
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    let widgetId: string | null = null;
    const render = () => {
      if (!box.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(box.current, {
        sitekey: SITE_KEY,
        language: "ja",
        callback: (t: string) => cb.current(t),
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    };
    if (window.turnstile) render();
    else {
      const id = "cf-turnstile-script";
      let script = document.getElementById(id) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = id;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={box} className="flex justify-center" />;
}

export const turnstileRequired = Boolean(SITE_KEY);
