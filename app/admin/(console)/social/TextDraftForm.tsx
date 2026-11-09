"use client";

import { useState } from "react";
import { CreateDraftButton } from "./CreateDraftButton";

type Action = (audience: "public" | "shop", note: string) => Promise<{ ok: boolean; message: string }>;

/** 文章だけの下書き(LOCAPASSのThreads)。「今回だけの一言」を添えて、一般向け/店舗向けを選んで作る。 */
export function TextDraftForm({ action }: { action: Action }) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="今回だけの一言(任意)例: 雨の日の話にして / もっと短く" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
      <div className="flex flex-wrap gap-2">
        <CreateDraftButton action={() => action("public", note)} label="一般向けの下書きを作る" primary />
        <CreateDraftButton action={() => action("shop", note)} label="店舗向けの下書きを作る" />
      </div>
    </div>
  );
}
