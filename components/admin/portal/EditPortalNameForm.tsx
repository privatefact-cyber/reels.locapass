"use client";

import { useActionState, useEffect, useRef } from "react";
import { updatePortalName, type UpdatePortalNameState } from "@/app/admin/(console)/portals/actions";

export function EditPortalNameForm({ portalId, currentName }: { portalId: number; currentName: string }) {
  const [state, formAction, pending] = useActionState<UpdatePortalNameState, FormData>(
    updatePortalName.bind(null, portalId),
    { status: "idle" },
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-4 flex gap-2" onClick={(event) => event.stopPropagation()}>
      <input
        name="portal_name"
        required
        defaultValue={currentName}
        aria-label="ポータル名"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "保存中..." : "名前を変更"}
      </button>
      {state.status === "error" && <span className="self-center text-xs text-red-600">{state.message}</span>}
      {state.status === "success" && <span className="self-center text-xs text-emerald-600">保存しました</span>}
    </form>
  );
}
