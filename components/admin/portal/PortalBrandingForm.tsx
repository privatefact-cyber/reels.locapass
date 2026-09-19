"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updatePortalBranding } from "@/app/admin/(console)/portals/actions";

type Props = {
  portal: {
    id: number;
    name: string;
    tagline: string | null;
    description: string | null;
    accent_color: string;
    background_color: string;
    hero_media_type: string;
    hero_media_url: string | null;
  };
};

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"];

export function PortalBrandingForm({ portal }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [name, setName] = useState(portal.name);
  const [tagline, setTagline] = useState(portal.tagline ?? "");
  const [description, setDescription] = useState(portal.description ?? "");
  const [accentColor, setAccentColor] = useState(portal.accent_color);
  const [backgroundColor, setBackgroundColor] = useState(portal.background_color);
  const [heroUrl, setHeroUrl] = useState(portal.hero_media_url);
  const [heroType, setHeroType] = useState<"image" | "video">(portal.hero_media_type === "video" ? "video" : "image");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function upload(file: File) {
    setError(null);
    if (!ACCEPT.includes(file.type)) return setError("JPG / PNG / WEBP / GIF / MP4 / WEBM のみ対応しています");
    if (file.size > MAX_BYTES) return setError("ファイルサイズは50MB以下にしてください");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || (file.type.startsWith("video/") ? "mp4" : "jpg");
      const path = `${portal.id}/hero-${Date.now()}.${ext}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("locapass-portal-media").upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = supabase.storage.from("locapass-portal-media").getPublicUrl(path);
      setHeroUrl(data.publicUrl);
      setHeroType(file.type.startsWith("video/") ? "video" : "image");
      setMessage("素材をアップロードしました。保存ボタンで公開側に反映します。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await updatePortalBranding(portal.id, { name, tagline, description, accentColor, backgroundColor, heroMediaType: heroType, heroMediaUrl: heroUrl });
        setMessage("保存しました。公開ポータルに反映されています。");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">ポータルのデザイン・ヒーロー</h2>
      <p className="mt-1 text-xs text-slate-500">この設定はルート管理者と、このポータルの管理者だけが変更できます。</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) void upload(file); }}
            className={`relative flex min-h-56 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition ${dragOver ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}
          >
            {heroUrl ? (heroType === "video" ? <video src={heroUrl} controls muted className="absolute inset-0 h-full w-full object-cover" /> : <img src={heroUrl} alt="ヒーロープレビュー" className="absolute inset-0 h-full w-full object-cover" />) : null}
            <div className={`relative z-10 rounded-lg px-4 py-3 text-center text-xs ${heroUrl ? "bg-black/65 text-white" : "text-slate-500"}`}>
              <strong className="block text-sm">{uploading ? "アップロード中..." : "画像・動画をドロップ"}</strong>
              <span className="mt-1 block">またはクリックして選択（最大50MB）</span>
            </div>
          </div>
          <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
          {heroUrl && <button type="button" onClick={() => setHeroUrl(null)} className="mt-2 text-xs text-red-600 hover:underline">ヒーロー素材を外す</button>}
        </div>
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-slate-600">ポータル名<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
          <label className="block text-xs font-semibold text-slate-600">キャッチコピー<textarea value={tagline} onChange={(e) => setTagline(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
          <label className="block text-xs font-semibold text-slate-600">サブコピー・説明文<textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold text-slate-600">アクセント<input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white p-1" /></label><label className="block text-xs font-semibold text-slate-600">背景<input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white p-1" /></label></div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={pending || uploading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{pending ? "保存中..." : "設定を保存"}</button>{message && <span className="text-xs text-emerald-700">{message}</span>}{error && <span className="text-xs text-red-600">{error}</span>}</div>
    </section>
  );
}
