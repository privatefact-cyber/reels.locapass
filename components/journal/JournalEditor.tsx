"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { ArticleView } from "@/components/journal/ArticleView";
import { deleteJournalPost, saveJournalPost } from "@/app/journal/actions";
import { uploadJournalImage } from "@/lib/storage/uploadToR2";
import { JOURNAL_CATEGORY_LABELS, parseJournalBody, type JournalCategory, type JournalPost } from "@/lib/journal/posts";

export type JournalEditorInitial = {
  id?: string;
  slug: string;
  category: JournalCategory;
  title: string;
  description: string;
  lead: string;
  coverUrl: string;
  coverAlt: string;
  bodyText: string;
  status: "draft" | "published";
  publishedOn: string;
};

const input =
  "w-full rounded-xl border border-main/15 bg-panel-950 px-3 py-2.5 text-sm text-main placeholder:text-tone-600 focus:border-hl-400/60 focus:outline-none";
const label = "block space-y-1";
const labelText = "text-xs text-tone-500";

/** 記事を書く・直す画面。ルート管理者と投稿担当だけが開ける(開けるかどうかは、ページ側で確認している)。 */
export function JournalEditor({ initial }: { initial: JournalEditorInitial }) {
  const router = useRouter();
  const isNew = !initial.id;
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState<"draft" | "published" | "delete" | "upload" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const bodyFileRef = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof JournalEditorInitial>(k: K, v: JournalEditorInitial[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save(status: "draft" | "published") {
    setBusy(status);
    setMessage(null);
    const res = await saveJournalPost({ ...f, status });
    setBusy(null);
    if (!res.ok) {
      setMessage({ kind: "error", text: res.error });
      return;
    }
    if (res.status === "published") {
      router.push(`/journal/${res.slug}`);
      router.refresh();
      return;
    }
    setMessage({ kind: "ok", text: "下書きを保存しました。" });
    setF((p) => ({ ...p, status: "draft" }));
    if (isNew) router.replace(`/journal/${res.slug}/edit`);
  }

  async function remove() {
    if (!initial.id || !window.confirm("この記事を削除しますか? 元に戻せません。")) return;
    setBusy("delete");
    const res = await deleteJournalPost(initial.id);
    setBusy(null);
    if (!res.ok) {
      setMessage({ kind: "error", text: res.error ?? "削除できませんでした。" });
      return;
    }
    router.push("/journal");
    router.refresh();
  }

  async function pickCover(file: File) {
    setBusy("upload");
    setMessage(null);
    try {
      const url = await uploadJournalImage(file);
      setF((p) => ({ ...p, coverUrl: url, coverAlt: p.coverAlt || p.title.slice(0, 60) }));
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "アップロードに失敗しました。" });
    }
    setBusy(null);
  }

  // 本文のカーソルの位置に、写真を入れる(説明は、[ ]の中を書き換える)。
  async function insertImage(file: File) {
    setBusy("upload");
    setMessage(null);
    try {
      const url = await uploadJournalImage(file);
      const ta = bodyRef.current;
      const pos = ta ? ta.selectionStart : f.bodyText.length;
      const before = f.bodyText.slice(0, pos);
      const after = f.bodyText.slice(pos);
      const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
      const tail = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
      set("bodyText", `${before}${lead}![写真の説明](${url})${tail}${after}`);
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "アップロードに失敗しました。" });
    }
    setBusy(null);
  }

  const draftPost: JournalPost = {
    slug: f.slug,
    category: f.category,
    date: f.publishedOn,
    title: f.title,
    description: f.description,
    ...(f.lead ? { lead: f.lead } : {}),
    ...(f.coverUrl ? { cover: { src: f.coverUrl, alt: f.coverAlt } } : {}),
    body: parseJournalBody(f.bodyText),
  };

  const working = busy !== null;
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 pb-28 pt-6 md:pt-8">
      <Link href={initial.status === "published" && initial.slug ? `/journal/${initial.slug}` : "/journal"} className="text-xs text-muted hover:text-main">
        ← 戻る
      </Link>
      <h1 className="text-lg font-bold text-main">{isNew ? "記事を書く" : "記事を編集"}</h1>
      {!isNew ? (
        <p className="text-xs text-tone-500">
          いまの状態:{" "}
          <span className={f.status === "published" ? "text-emerald-400" : "text-amber-300"}>{f.status === "published" ? "公開中" : "下書き"}</span>
        </p>
      ) : null}

      <label className={label}>
        <span className={labelText}>タイトル(必須)</span>
        <input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={200} className={input} placeholder="例: おいしかった一皿を、そのお店のページに" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          <span className={labelText}>カテゴリ</span>
          <select value={f.category} onChange={(e) => set("category", e.target.value as JournalCategory)} className={input}>
            {(Object.keys(JOURNAL_CATEGORY_LABELS) as JournalCategory[]).map((c) => (
              <option key={c} value={c}>
                {JOURNAL_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className={labelText}>公開日</span>
          <input type="date" value={f.publishedOn} onChange={(e) => set("publishedOn", e.target.value)} className={input} />
        </label>
      </div>

      <label className={label}>
        <span className={labelText}>URL名(半角の英小文字・数字・ハイフン)</span>
        <input value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className={input} placeholder="例: post-photo-to-shop" />
        <span className="text-[11px] text-tone-600">https://locapass.net/journal/{f.slug || "…"}</span>
      </label>

      <label className={label}>
        <span className={labelText}>要約(一覧と検索結果に出る、1〜2文)</span>
        <textarea value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={400} rows={2} className={input} />
      </label>

      <label className={label}>
        <span className={labelText}>導入の一文(記事の冒頭に大きく出る。空でもOK)</span>
        <textarea value={f.lead} onChange={(e) => set("lead", e.target.value)} maxLength={400} rows={2} className={input} />
      </label>

      <div className="space-y-2">
        <span className={labelText}>表紙の写真</span>
        {f.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.coverUrl} alt={f.coverAlt} className="aspect-[16/10] w-full rounded-2xl object-cover" />
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center rounded-2xl border border-dashed border-main/25 text-xs text-tone-500">
            まだ選んでいません(写真なしでも飾りの表紙になります)
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={working}
            onClick={() => coverFileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-main/15 px-3 py-1.5 text-xs text-tone-300 hover:text-main disabled:opacity-50"
          >
            {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            写真を選ぶ
          </button>
          {f.coverUrl ? (
            <button type="button" onClick={() => set("coverUrl", "")} className="text-xs text-tone-400 underline">
              表紙を外す
            </button>
          ) : null}
        </div>
        {f.coverUrl ? (
          <input value={f.coverAlt} onChange={(e) => set("coverAlt", e.target.value)} maxLength={300} className={input} placeholder="写真の説明(読み上げ用。例: 和食の定食)" />
        ) : null}
        <input
          ref={coverFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void pickCover(file);
          }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className={labelText}>本文</span>
          <button
            type="button"
            disabled={working}
            onClick={() => bodyFileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-main/15 px-3 py-1.5 text-xs text-tone-300 hover:text-main disabled:opacity-50"
          >
            {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            カーソルの位置に写真を入れる
          </button>
        </div>
        <textarea
          ref={bodyRef}
          value={f.bodyText}
          onChange={(e) => set("bodyText", e.target.value)}
          rows={18}
          className={`${input} font-mono leading-7`}
          placeholder={"## 見出し\n\nここに文章を書きます。空行で段落が分かれます。\n\n- 箇条書きは、行の先頭に「- 」\n- 続けて書くと1つのリストになります\n\n![写真の説明](写真のURL)"}
        />
        <p className="text-[11px] leading-5 text-tone-600">
          書き方: 「## 」で見出し、「- 」で箇条書き、空行で段落。写真は上のボタンで入れると、「![写真の説明](URL)」が入るので、[ ]の中を書き換えると、写真の下に説明が出ます。
        </p>
        <input
          ref={bodyFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void insertImage(file);
          }}
        />
      </div>

      <div>
        <button type="button" onClick={() => setPreview((v) => !v)} className="text-xs text-hl-200 underline">
          {preview ? "プレビューを閉じる" : "プレビューを見る"}
        </button>
        {preview ? (
          <div className="mt-4 space-y-6 rounded-2xl border border-main/10 p-4">
            <ArticleView post={draftPost} linkCategory={false} />
          </div>
        ) : null}
      </div>

      {message ? (
        <p className={`rounded-xl px-3 py-2 text-xs ${message.kind === "ok" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`} role="status">
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={working}
          onClick={() => save("published")}
          className="inline-flex items-center gap-2 rounded-full bg-cta-light px-5 py-2.5 text-sm font-bold text-on-cta-gold transition hover:bg-cta-hover disabled:opacity-50"
        >
          {busy === "published" ? <Loader2 size={14} className="animate-spin" /> : null}
          {f.status === "published" ? "更新して公開" : "公開する"}
        </button>
        <button
          type="button"
          disabled={working}
          onClick={() => save("draft")}
          className="inline-flex items-center gap-2 rounded-full border border-main/20 px-5 py-2.5 text-sm text-tone-300 transition hover:text-main disabled:opacity-50"
        >
          {busy === "draft" ? <Loader2 size={14} className="animate-spin" /> : null}
          {f.status === "published" ? "非公開(下書き)に戻す" : "下書きを保存"}
        </button>
        {!isNew ? (
          <button type="button" disabled={working} onClick={remove} className="ml-auto text-xs text-red-300 underline disabled:opacity-50">
            削除
          </button>
        ) : null}
      </div>
    </div>
  );
}
