"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { savePetDiary } from "@/app/pet/actions";
import { todayJst } from "@/lib/pet/calc";
import { VISIBILITY_LABEL, type PetVisibility } from "@/lib/pet/types";
import { uploadPetImage } from "./petUpload";
import { useAiConsent } from "./AiConsent";
import { PetField, petButton, petInput } from "./ui";

function PhotoPreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={file.name} className="h-24 w-24 rounded-2xl object-cover" /> : null;
}


/**
 * 成長日誌(写真・体重・ひとこと)を追加する。
 * - 見られる人を「公開」にすると、うちの子自慢ギャラリーに並ぶ(位置は持たない)
 * - 場所を付けて地図に共有するのは LOCAPASS snap の投稿画面(/photo/new)。日誌には場所を持たせない。
 */
export function DiaryForm({ petId, autoOpen = false }: { petId: string; autoOpen?: boolean }) {
  const router = useRouter();
  const aiConsent = useAiConsent();
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(autoOpen);
  const [entryDate, setEntryDate] = useState(todayJst);
  const [weight, setWeight] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<PetVisibility>("private");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hasContent = Boolean(body.trim() || files.length || weight.trim());

  useEffect(() => {
    if (!open) return;
    const modal = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    modal.showModal();
    document.body.style.overflow = "hidden";
    // iOSのキーボードで隠れないよう、表示領域の高さ・位置に追従する。
    const viewport = window.visualViewport;
    const resize = () => {
      modal.style.setProperty("--diary-height", `${viewport?.height ?? window.innerHeight}px`);
      modal.style.setProperty("--diary-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      modal.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  async function save() {
    if (saving.current || !hasContent) return;
    if (!entryDate) { setError("日付を入れてください"); return; }
    if (weight && (!Number.isFinite(Number(weight)) || Number(weight) < 0.1 || Number(weight) > 120)) {
      setError("体重は0.1〜120kgで入力してください"); return;
    }
    setError(null);
    saving.current = true;
    setBusy(true);
    try {
      // 公開する写真は、外部のAIで内容を確かめる。送る前に同意を確かめる(同意しないときは「自分だけ」「フォロワー」で保存できる)。
      // 既存の同意画面がモーダルの下に隠れないよう、同意が要るときだけ日誌のモーダルをいったん閉じ、済んだら本文を保ったまま戻す。
      if (visibility === "public" && files.length > 0) {
        const modal = dialog.current;
        if (!aiConsent.granted) modal?.close();
        let granted: boolean;
        try {
          granted = await aiConsent.ensure();
        } finally {
          if (modal?.isConnected && !modal.open) modal.showModal();
        }
        if (!granted) {
          setError("公開前の写真の確認(AI)に同意していないため、公開できません。「自分だけ」「フォロワー」なら、このまま保存できます");
          return;
        }
      }
      const imagePaths: string[] = [];
      for (const file of files) imagePaths.push(await uploadPetImage("diary", petId, file));
      const res = await savePetDiary({ petId, entryDate, weightKg: weight, body, imagePaths, visibility });
      if (!res.ok) {
        throw new Error(res.error === "AI_CONSENT_REQUIRED" ? "公開前の写真の確認(AI)への同意が必要です。もう一度、公開で保存してください" : res.error);
      }
      reset();
      setNotice(visibility === "public" ? "保存しました。うちの子自慢ギャラリーに載りました 🎉" : "保存しました");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function reset() {
    setOpen(false);
    setEntryDate(todayJst());
    setFiles([]);
    setWeight("");
    setBody("");
    setVisibility("private");
  }

    return (
    <>
      <button type="button" onClick={() => { setNotice(null); setOpen(true); }} className={`${petButton.primary} w-full`}>
        <Plus size={18} />{hasContent ? "書きかけの日誌をひらく" : "きょうの日誌を書く"}
      </button>
      {notice && <p role="status" className="mt-2 rounded-2xl bg-[#E5F7F0] px-3 py-2 text-center text-sm font-bold text-[#22806A]">{notice}</p>}
      <dialog
        ref={dialog}
        aria-labelledby="diary-title"
        aria-describedby="diary-hint"
        aria-busy={busy}
        onCancel={(event) => { event.preventDefault(); if (!saving.current) setOpen(false); }}
        className="fixed inset-x-0 bottom-auto top-[var(--diary-top,0px)] m-0 h-[var(--diary-height,100dvh)] max-h-none w-full max-w-none overflow-hidden border-0 bg-[#FFFCF8] p-0 text-[#4A3426] backdrop:bg-black/40 sm:mx-auto sm:mt-6 sm:h-[min(800px,calc(var(--diary-height,100dvh)-48px))] sm:max-w-xl sm:rounded-[28px] sm:shadow-2xl"
      >
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#F1E1CF] bg-white px-4 py-3">
            <button type="button" autoFocus onClick={() => setOpen(false)} disabled={busy} aria-label="閉じて入力を保持" className="flex h-11 w-11 items-center justify-center rounded-full text-[#9C8273] disabled:opacity-50">
              <X size={22} />
            </button>
            <h2 id="diary-title" className="text-base font-extrabold">日誌を書く</h2>
            <button type="button" onClick={save} disabled={busy || !hasContent} className={`${petButton.primary} min-h-11 px-4 text-sm`}>
              {busy && <Loader2 size={16} className="animate-spin" />}{busy ? (visibility === "public" && files.length > 0 ? "確認中…" : "投稿中…") : "投稿する"}
            </button>
          </header>
          {error && <p role="alert" className="shrink-0 bg-[#FFE4E4] px-5 py-3 text-sm font-bold text-[#D04848]">{error}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4">
            <p id="diary-hint" className="mb-4 text-sm text-[#9C8273]">ひとことでも、写真だけでも。今日の思い出を残そう。</p>
            <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-60">
              <div>
                <label htmlFor="diary-body" className="mb-2 block text-sm font-bold">今日のできごと</label>
                <textarea id="diary-body" className={`${petInput} min-h-[240px] resize-y leading-7`} rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="今日はどんな一日だった？" maxLength={1000} />
                <p className="mt-1 text-right text-xs text-[#9C8273]">{body.length} / 1,000</p>
              </div>
              <div>
                <button type="button" disabled={files.length >= 4} onClick={() => fileInput.current?.click()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E8B899] bg-[#FFF0E5] px-4 py-4 text-base font-bold text-[#A44D2A] disabled:opacity-50">
                  <Camera size={24} />{files.length >= 4 ? "写真を4枚選びました" : "写真を追加"}<span className="text-xs">{files.length} / 4枚</span>
                </button>
                <p className="mt-2 text-xs text-[#9C8273]">写真ライブラリから選択できます（最大4枚）</p>
                {files.length > 0 && <div className="mt-3 flex flex-wrap gap-3">
                  {files.map((file, i) => (
                    <div key={`${file.name}-${file.lastModified}-${i}`} className="relative pt-2 pr-2">
                      <PhotoPreview file={file} />
                      <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#7A6050] shadow" aria-label={`${i + 1}枚目の写真を外す`}><X size={20} /></button>
                    </div>
                  ))}
                </div>}
              </div>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#F1E1CF] bg-white px-4 py-3">
                <span className="shrink-0 text-sm font-bold">見られる人</span>
                <select className="min-h-11 min-w-0 rounded-xl bg-[#FFF0E5] px-3 text-base text-[#7A6050]" value={visibility} onChange={(e) => setVisibility(e.target.value as PetVisibility)}>
                  {(Object.keys(VISIBILITY_LABEL) as PetVisibility[]).map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
                </select>
              </label>
              {visibility === "public" && <p className="text-xs leading-relaxed text-[#9C8273]">写真が「うちの子自慢ギャラリー」に並びます。場所は付きません（写真の位置情報も消して保存します）。</p>}
              <details className="rounded-2xl border border-[#F1E1CF] bg-white p-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">日付・体重<span className="flex items-center gap-2 text-xs font-normal text-[#9C8273]">{entryDate.replaceAll("-", "/")}<ChevronDown size={16} /></span></summary>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <PetField label="日付"><input type="date" className={petInput} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></PetField>
                  <PetField label="体重（kg・任意）"><input className={petInput} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="例: 3.4" /></PetField>
                </div>
              </details>
              <p className="text-center text-xs text-[#9C8273]">閉じても、このページにいる間は入力内容が残ります。</p>
              <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                const remaining = 4 - files.length;
                setError(picked.length > remaining ? "写真は最大4枚です。先頭から4枚まで追加しました。" : null);
                setFiles((p) => [...p, ...picked].slice(0, 4));
                e.target.value = "";
              }} />
            </fieldset>
          </div>
        </div>
      </dialog>
    </>
  );
}
