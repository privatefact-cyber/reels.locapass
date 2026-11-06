"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, PenLine, Sparkles, X } from "lucide-react";
import { savePetDocument } from "@/app/pet/actions";
import { expiryFor } from "@/lib/pet/calc";
import type { PetScanResult } from "@/lib/pet/scan";
import { DOC_TYPE_EMOJI, DOC_TYPE_LABEL, type PetDocType } from "@/lib/pet/types";
import { downscaleImage, imageToBase64 } from "./petUpload";
import { saveLocalImage } from "./localImages";
import { LocalImageNotice } from "./LocalImage";
import { PetCard, PetField, petButton, petInput } from "./ui";

type Draft = {
  docType: PetDocType;
  administeredOn: string;
  expiresOn: string;
  clinicName: string;
  vaccineName: string;
  registrationNo: string;
  note: string;
};

const EMPTY: Draft = { docType: "rabies", administeredOn: "", expiresOn: "", clinicName: "", vaccineName: "", registrationNo: "", note: "" };

/** 書類を撮影→AIで読み取り→確認して保存。手入力でも追加できる。 */
export function DocumentScanner({ petId }: { petId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [scan, setScan] = useState<PetScanResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setFile(null);
    setPreview(null);
    setDraft(EMPTY);
    setScan(null);
    setError(null);
  }

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => {
      const next = { ...d, [k]: v };
      // 種類か接種日を変えたら、次の期限を自動で入れ直す(手で直した期限はそのまま)
      if ((k === "administeredOn" || k === "docType") && (!d.expiresOn || d.expiresOn === expiryFor(d.docType, { administeredOn: d.administeredOn || null }))) {
        next.expiresOn = expiryFor(next.docType, { administeredOn: next.administeredOn || null, fiscalYear: scan?.fiscalYear ?? null }) ?? "";
      }
      if (next.docType === "license") next.expiresOn = "";
      return next;
    });
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setOpen(true);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
    setMessage(null);
    setPhase("reading");
    try {
      const { base64, mimeType } = await imageToBase64(f);
      const res = await fetch("/api/pet/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: base64, mimeType }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "読み取れませんでした");
      const s = body.scan as PetScanResult;
      setScan(s);
      setDraft({
        docType: s.docType,
        administeredOn: s.administeredOn ?? "",
        expiresOn: (body.expiresOn as string | null) ?? "",
        clinicName: s.clinicName ?? "",
        vaccineName: s.vaccineName ?? "",
        registrationNo: s.registrationNo ?? "",
        note: s.fiscalYear && !s.administeredOn ? `${s.fiscalYear}年度の注射済票` : "",
      });
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "読み取れませんでした"}。下の欄に手で入れて保存できます。`);
    } finally {
      setPhase("idle");
    }
  }

  async function save() {
    setPhase("saving");
    setError(null);
    try {
      // 画像はサーバーに送らず、この端末(IndexedDB)にだけ保存する。サーバーには参照("local:…")と読み取った文字だけを送る
      const imagePath = file ? await saveLocalImage(await downscaleImage(file, 2000, 0.88), { petId, kind: "document" }) : null;
      const res = await savePetDocument({ petId, ...draft, imagePath, aiResult: scan ?? undefined });
      if (!res.ok) throw new Error(res.error);
      reset();
      setMessage("手帳に追加しました 🐾");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div>
      {!open ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} className={petButton.primary}>
            <Camera size={18} />
            書類を撮ってAIで登録
          </button>
          <button type="button" onClick={() => setOpen(true)} className={petButton.soft} aria-label="手入力で追加">
            <PenLine size={16} />
            手入力
          </button>
        </div>
      ) : (
        <PetCard className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1 text-sm font-extrabold text-[#EE6A36]">
              <Sparkles size={16} />
              {phase === "reading" ? "AIが読み取り中…" : scan ? "読み取り結果を確認してください" : "書類を追加"}
            </p>
            <button type="button" onClick={reset} aria-label="閉じる" className="rounded-full p-1 text-[#B39C8C]">
              <X size={20} />
            </button>
          </div>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="書類" className={`max-h-56 w-full rounded-2xl object-contain bg-[#FFF8F2] ${phase === "reading" ? "animate-pulse" : ""}`} />
          )}
          {phase === "reading" ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm font-bold text-[#9C8273]">
              <Loader2 className="animate-spin" size={18} />
              種類と日付を読んでいます
            </div>
          ) : (
            <>
              <div>
                <span className="mb-1 block px-1 text-[13px] font-bold text-[#7A6050]">書類の種類</span>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(DOC_TYPE_LABEL) as PetDocType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("docType", t)}
                      className={`rounded-2xl border-2 px-3 py-2 text-left text-xs font-bold transition ${draft.docType === t ? "border-[#FF8E5E] bg-[#FFEBDD] text-[#C2562A]" : "border-[#F1E1CF] text-[#9C8273]"}`}
                    >
                      <span className="mr-1" aria-hidden>
                        {DOC_TYPE_EMOJI[t]}
                      </span>
                      {DOC_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PetField label={draft.docType === "license" ? "登録日" : "接種日"}>
                  <input type="date" className={petInput} value={draft.administeredOn} onChange={(e) => set("administeredOn", e.target.value)} />
                </PetField>
                {draft.docType !== "license" && (
                  <PetField label="次の期限">
                    <input type="date" className={petInput} value={draft.expiresOn} onChange={(e) => setDraft((d) => ({ ...d, expiresOn: e.target.value }))} />
                  </PetField>
                )}
              </div>
              {draft.docType === "rabies" && <p className="px-1 text-xs text-[#B39C8C]">狂犬病の予防注射は年に1回(毎年4〜6月)。期限は接種日の1年後を目安に入れています。</p>}
              {draft.docType === "license" && <p className="px-1 text-xs text-[#B39C8C]">鑑札は一生に1回の登録で、期限はありません。</p>}
              {draft.docType === "insurance" && <p className="px-1 text-xs text-[#B39C8C]">保険期間の開始日と満了日を入れてください。満了日が近づいたらお知らせします。</p>}
              <PetField label="動物病院・自治体">
                <input className={petInput} value={draft.clinicName} onChange={(e) => set("clinicName", e.target.value)} />
              </PetField>
              {draft.docType !== "license" && (
                <PetField label="ワクチン名">
                  <input className={petInput} value={draft.vaccineName} onChange={(e) => set("vaccineName", e.target.value)} placeholder="例: 6種混合" />
                </PetField>
              )}
              <PetField label="番号(鑑札・注射済票)">
                <input className={petInput} value={draft.registrationNo} onChange={(e) => set("registrationNo", e.target.value)} />
              </PetField>
              <PetField label="メモ">
                <input className={petInput} value={draft.note} onChange={(e) => set("note", e.target.value)} />
              </PetField>
              {!file && (
                <button type="button" onClick={() => fileInput.current?.click()} className={`${petButton.soft} w-full`}>
                  <Camera size={16} />
                  写真もつける
                </button>
              )}
              <button type="button" onClick={save} disabled={phase === "saving"} className={`${petButton.primary} w-full`}>
                {phase === "saving" && <Loader2 size={18} className="animate-spin" />}
                手帳に保存
              </button>
              <LocalImageNotice />
            </>
          )}
          {error && <p className="rounded-2xl bg-[#FFF0C9] px-3 py-2 text-xs font-bold text-[#9A6B00]">{error}</p>}
        </PetCard>
      )}
      {message && <p className="mt-2 text-center text-sm font-bold text-[#2E9C7C]">{message}</p>}
      <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
