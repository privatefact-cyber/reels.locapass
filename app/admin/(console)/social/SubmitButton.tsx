"use client";

import * as ReactDOM from "react-dom";
import { useEffect, useState } from "react";

// @types/react-dom が入っていないので、React 19 のフックの型だけここで補う。
const useFormStatus = (ReactDOM as unknown as { useFormStatus: () => { pending: boolean } }).useFormStatus;

/**
 * 送信中は、押せなくして「投稿中…(経過秒数)」を出す。
 * 動画の投稿は、Metaの処理待ちで1〜2分かかる。止まっているのか動いているのか分かるようにする。
 */
export function SubmitButton({ children, pendingText, className, name, value, slow }: { children: React.ReactNode; pendingText: string; className?: string; name?: string; value?: string; slow?: string }) {
  const { pending } = useFormStatus();
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!pending) { setSec(0); return; }
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);
  return (
    <>
      <button name={name} value={value} disabled={pending} aria-busy={pending} className={`${className ?? ""} ${pending ? "cursor-wait opacity-70" : ""}`}>
        {pending ? `${pendingText}(${sec}秒)` : children}
      </button>
      {pending && slow ? <span role="status" className="basis-full text-xs font-semibold text-amber-700">{slow}</span> : null}
    </>
  );
}
