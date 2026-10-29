"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Link as LinkIcon, Loader2, Trash2 } from "lucide-react";
import { ArticleView } from "@/components/journal/ArticleView";
import { deleteJournalPost, saveJournalPost } from "@/app/journal/actions";
import { uploadJournalImage } from "@/lib/storage/uploadToR2";
import {
  JOURNAL_CATEGORY_LABELS,
  JOURNAL_DEFAULT_LINK_LABEL,
  isSafeLinkUrl,
  parseJournalBody,
  type JournalCategory,
  type JournalPost,
} from "@/lib/journal/posts";

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
  linkUrl: string;
  linkLabel: string;
};

/** 本文のリンク先に選べる、ほかの記事(下書きも含む)。 */
export type JournalLinkTarget = { slug: string; title: string };

/**
 * 本文の写真。編集画面の本文には「【写真1】」だけを出し、写真のURLや説明は下の一覧で扱う
 * (保存・プレビューのときに、「![説明](URL)」の書式に直す。URLを手で書く必要はない)。
 */
type Photo = { n: number; url: string; caption: string };
const IMG_LINE = /^!\[([^\]]*)\]\((\S+)\)$/;
const PH_LINE = /^【写真(\d+)】$/;

/** 保存済みの本文(![説明](URL) の行を含む)  →  編集画面の本文(【写真n】)と写真の一覧。 */
function toEditorText(md: string): { text: string; photos: Photo[] } {
  const photos: Photo[] = [];
  const text = md
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((raw) => {
      const m = IMG_LINE.exec(raw.trim());
      if (!m) return raw;
      const n = photos.length + 1;
      photos.push({ n, url: m[2], caption: m[1].trim() });
      return `【写真${n}】`;
    })
    .join("\n");
  return { text, photos };
}

/** 編集画面の本文  →  保存する書式。一覧に無い【写真n】があれば unknown に入れる。 */
function toMarkdown(text: string, photos: Photo[]): { md: string; unknown: number[] } {
  const byN = new Map(photos.map((p) => [p.n, p]));
  const unknown: number[] = [];
  const md = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((raw) => {
      const m = PH_LINE.exec(raw.trim());
      if (!m) return raw;
      const photo = byN.get(Number(m[1]));
      if (!photo) {
        unknown.push(Number(m[1]));
        return raw;
      }
      return `![${photo.caption.replace(/[\[\]\n]/g, " ").trim()}](${photo.url})`;
    })
    .join("\n");
  return { md, unknown };
}


const input =
  "w-full rounded-xl border border-main/15 bg-panel-950 px-3 py-2.5 text-sm text-main placeholder:text-tone-600 focus:border-hl-400/60 focus:outline-none";
const label = "block space-y-1";
const labelText = "text-xs text-tone-500";

/** 記事を書く・直す画面。ルート管理者と投稿担当だけが開ける(開けるかどうかは、ページ側で確認している)。 */
export function JournalEditor({ initial, articles = [] }: { initial: JournalEditorInitial; articles?: JournalLinkTarget[] }) {
  const router = useRouter();
  const isNew = !initial.id;
  const [initialBody] = useState(() => toEditorText(initial.bodyText));
  const [f, setF] = useState({ ...initial, bodyText: initialBody.text });
  const [photos, setPhotos] = useState<Photo[]>(initialBody.photos);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"draft" | "published" | "delete" | "upload" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const bodyFileRef = useRef<HTMLInputElement | null>(null);
  // 本文に入れるリンク: 選んでいる文字を、ほかの記事や好きなURLへのリンクにする。
  const [linkPanel, setLinkPanel] = useState<{ open: boolean; selStart: number; selEnd: number; articleSlug: string; url: string }>({
    open: false,
    selStart: 0,
    selEnd: 0,
    articleSlug: "",
    url: "",
  });

  const set = <K extends keyof JournalEditorInitial>(k: K, v: JournalEditorInitial[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save(status: "draft" | "published") {
    const { md, unknown } = toMarkdown(f.bodyText, photos);
    if (unknown.length > 0) {
      setMessage({ kind: "error", text: `本文の「【写真${unknown[0]}】」に対応する写真がありません。消すか、写真をドラッグして入れ直してください。` });
      return;
    }
    setBusy(status);
    setMessage(null);
    const res = await saveJournalPost({ ...f, bodyText: md, status });
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

  // 本文のカーソルの位置に、写真を入れる(複数まとめてOK)。ドラッグ&ドロップ・貼り付け・ボタンのどれからでも使う。
  async function insertImages(files: File[]) {
    const images = files.filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type));
    if (images.length === 0) {
      if (files.length > 0) setMessage({ kind: "error", text: "写真は、JPEG・PNG・WebP の形式を入れてください。" });
      return;
    }
    setBusy("upload");
    setMessage(null);
    const pos = bodyRef.current ? bodyRef.current.selectionStart : f.bodyText.length;
    const uploaded: string[] = [];
    let failed: string | null = null;
    for (const file of images) {
      try {
        uploaded.push(await uploadJournalImage(file));
      } catch (e) {
        failed = e instanceof Error ? e.message : "アップロードに失敗しました。";
        break;
      }
    }
    if (uploaded.length > 0) {
      const base = photos.reduce((m, p) => Math.max(m, p.n), 0);
      const added: Photo[] = uploaded.map((url, i) => ({ n: base + i + 1, url, caption: "" }));
      setPhotos((p) => [...p, ...added]);
      setF((p) => {
        const at = Math.min(pos, p.bodyText.length);
        const before = p.bodyText.slice(0, at);
        const after = p.bodyText.slice(at);
        const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
        const tail = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
        const tokens = added.map((a) => `【写真${a.n}】`).join("\n\n");
        return { ...p, bodyText: `${before}${lead}${tokens}${tail}${after}` };
      });
    }
    if (failed) setMessage({ kind: "error", text: uploaded.length > 0 ? `${uploaded.length}枚は入りましたが、残りは失敗しました: ${failed}` : failed });
    setBusy(null);
  }

  function removePhoto(n: number) {
    setPhotos((p) => p.filter((x) => x.n !== n));
    // 本文の【写真n】の行も消す。
    setF((p) => ({
      ...p,
      bodyText: p.bodyText
        .split("\n")
        .filter((line) => line.trim() !== `【写真${n}】`)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n"),
    }));
  }

  function insertExistingPhoto(n: number) {
    const pos = bodyRef.current ? bodyRef.current.selectionStart : f.bodyText.length;
    setF((p) => {
      const at = Math.min(pos, p.bodyText.length);
      const before = p.bodyText.slice(0, at);
      const after = p.bodyText.slice(at);
      const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
      const tail = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
      return { ...p, bodyText: `${before}${lead}【写真${n}】${tail}${after}` };
    });
  }

  const draftPost: JournalPost = {
    slug: f.slug,
    category: f.category,
    date: f.publishedOn,
    title: f.title,
    description: f.description,
    ...(f.lead ? { lead: f.lead } : {}),
    ...(f.coverUrl ? { cover: { src: f.coverUrl, alt: f.coverAlt } } : {}),
    body: parseJournalBody(toMarkdown(f.bodyText, photos).md),
    ...(f.linkUrl.trim() && isSafeLinkUrl(f.linkUrl.trim())
      ? { link: { url: f.linkUrl.trim(), label: f.linkLabel.trim() || JOURNAL_DEFAULT_LINK_LABEL } }
      : {}),
  };

  function openLinkPanel() {
    const ta = bodyRef.current;
    setLinkPanel({ open: true, selStart: ta?.selectionStart ?? 0, selEnd: ta?.selectionEnd ?? 0, articleSlug: "", url: "" });
  }

  function applyLink() {
    const target = linkPanel.articleSlug ? articles.find((a) => a.slug === linkPanel.articleSlug) : null;
    const url = target ? `/journal/${target.slug}` : linkPanel.url.trim().replace(/\)/g, "%29");
    if (!url || !isSafeLinkUrl(url)) {
      setMessage({ kind: "error", text: "リンク先は、記事を選ぶか、https:// から始まるURLを入れてください。" });
      return;
    }
    const selected = f.bodyText.slice(linkPanel.selStart, linkPanel.selEnd).replace(/[\[\]\n]/g, " ").trim();
    const text = selected || target?.title.replace(/[\[\]]/g, "") || url;
    const before = f.bodyText.slice(0, linkPanel.selStart);
    const after = f.bodyText.slice(linkPanel.selEnd);
    set("bodyText", `${before}[${text}](${url})${after}`);
    setLinkPanel((p) => ({ ...p, open: false }));
    setMessage(null);
  }

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
          <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={working}
            onClick={openLinkPanel}
            className="inline-flex items-center gap-1.5 rounded-full border border-main/15 px-3 py-1.5 text-xs text-tone-300 hover:text-main disabled:opacity-50"
          >
            <LinkIcon size={14} />
            選んだ文字にリンクをつける
          </button>
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
        </div>
        {linkPanel.open ? (
          <div className="space-y-2 rounded-2xl border border-hl-400/40 bg-panel-950 p-3">
            <p className="text-[11px] leading-5 text-tone-400">
              先に、本文のリンクにしたい文字を選んでおいてください(選ばずに押すと、記事のタイトルやURLが文字になります)。
            </p>
            <label className={label}>
              <span className={labelText}>ほかの記事にリンクする</span>
              <select
                value={linkPanel.articleSlug}
                onChange={(e) => setLinkPanel((p) => ({ ...p, articleSlug: e.target.value, url: "" }))}
                className={input}
              >
                <option value="">(記事を選ばない)</option>
                {articles
                  .filter((a) => a.slug !== f.slug)
                  .map((a) => (
                    <option key={a.slug} value={a.slug}>
                      {a.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className={label}>
              <span className={labelText}>または、好きなURLにリンクする</span>
              <input
                value={linkPanel.url}
                onChange={(e) => setLinkPanel((p) => ({ ...p, url: e.target.value, articleSlug: "" }))}
                className={input}
                placeholder="https://example.com/"
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={applyLink} className="rounded-full bg-cta-light px-4 py-2 text-xs font-bold text-on-cta-gold hover:bg-cta-hover">
                リンクをつける
              </button>
              <button type="button" onClick={() => setLinkPanel((p) => ({ ...p, open: false }))} className="text-xs text-tone-400 underline">
                やめる
              </button>
            </div>
          </div>
        ) : null}
        <div className="relative">
          <textarea
            ref={bodyRef}
            value={f.bodyText}
            onChange={(e) => set("bodyText", e.target.value)}
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types).includes("Files")) {
                e.preventDefault();
                setDragging(true);
              }
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              setDragging(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length === 0) return;
              e.preventDefault();
              void insertImages(files);
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((file) => file.type.startsWith("image/"));
              if (files.length === 0) return;
              e.preventDefault();
              void insertImages(files);
            }}
            rows={18}
            className={`${input} font-mono leading-7 ${dragging ? "border-hl-400 ring-2 ring-hl-400/40" : ""}`}
            placeholder={"## 見出し\n\nここに文章を書きます。空行で段落が分かれます。\n\n- 箇条書きは、行の先頭に「- 」\n- 続けて書くと1つのリストになります\n\n写真は、この欄にドラッグ&ドロップ(貼り付けもOK)"}
          />
          {dragging ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-sm font-bold text-hl-200">
              ここに写真をドロップ(カーソルの位置に入ります)
            </div>
          ) : null}
        </div>
        {photos.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-main/10 p-3">
            <span className={labelText}>本文の写真(説明は、写真の下に小さく出ます。空でもOK)</span>
            {photos.map((ph) => {
              const inBody = f.bodyText.split("\n").some((line) => line.trim() === `【写真${ph.n}】`);
              return (
                <div key={ph.n} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[11px] text-tone-500">
                      【写真{ph.n}】{" "}
                      {inBody ? (
                        "本文に入っています"
                      ) : (
                        <button type="button" onClick={() => insertExistingPhoto(ph.n)} className="text-amber-300 underline">
                          本文にありません(カーソルの位置に入れる)
                        </button>
                      )}
                    </p>
                    <input
                      value={ph.caption}
                      onChange={(e) => setPhotos((p) => p.map((x) => (x.n === ph.n ? { ...x, caption: e.target.value } : x)))}
                      maxLength={100}
                      className={input}
                      placeholder="写真の説明(例: 写真はイメージです)"
                    />
                  </div>
                  <button type="button" onClick={() => removePhoto(ph.n)} aria-label={`写真${ph.n}を削除`} className="shrink-0 rounded-full p-2 text-tone-400 hover:text-red-300">
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        <p className="text-[11px] leading-5 text-tone-600">
          書き方: 「## 」で見出し、「- 」で箇条書き、空行で段落。リンクは「[表示する文字](リンク先)」で、上のボタンでも入れられます。写真は、本文の欄にドラッグ&ドロップ(貼り付けや、上のボタンもOK)。「【写真1】」の行が写真になります。行ごと切り取って動かすと、場所を変えられます。
        </p>
        <input
          ref={bodyFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) void insertImages(files);
          }}
        />
      </div>

      <div className="space-y-2 rounded-2xl border border-main/10 p-3">
        <span className={labelText}>記事の一番下のリンク(任意。URLを空にすると、何も出ません)</span>
        <input
          value={f.linkUrl}
          onChange={(e) => set("linkUrl", e.target.value)}
          className={input}
          placeholder="https://example.com/ または /journal/記事のURL名"
        />
        <input
          value={f.linkLabel}
          onChange={(e) => set("linkLabel", e.target.value)}
          maxLength={60}
          className={input}
          placeholder={`ボタンの文字(空なら「${JOURNAL_DEFAULT_LINK_LABEL}」)`}
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
