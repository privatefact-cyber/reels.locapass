"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Pencil, Pin, PinOff, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { CastCommentsPanel } from "@/components/CastCommentsPanel";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { RevealableQr } from "@/components/RevealableQr";
import { validateReelFile, optimizeReelVideo } from "@/lib/reels/prepareReelFile";
import { uploadReelPreview } from "@/lib/reels/uploadReelPreview";

export type MyReel = {
  id: string;
  caption: string | null;
  media: { type: "video" | "image"; url: string }[];
  likesCount: number;
  createdAt: string;
  isCommentsEnabled: boolean;
  pinnedAt: string | null;
};

export type MyStory = {
  id: string;
  media: { type: "video" | "image"; url: string }[];
  createdAt: string;
  expiresAt: string;
};

const MAX_PINNED_REELS = 3;

export function CastMypageClient({
  castId,
  shopId,
  shopName,
  castCode,
  qrDataUrl,
  initialName,
  initialPrText,
  initialAvatarUrl,
  initialReels,
  initialStories,
}: {
  castId: string;
  shopId: string;
  shopName: string | null;
  castCode: string;
  qrDataUrl: string;
  initialName: string;
  initialPrText: string | null;
  initialAvatarUrl: string | null;
  initialReels: MyReel[];
  initialStories: MyStory[];
}) {
  const router = useRouter();
  const [reels, setReels] = useState(initialReels);
  const [stories, setStories] = useState(initialStories);

  // プロフィール(名前・自己紹介・アイコン)
  const [name, setName] = useState(initialName);
  const [prText, setPrText] = useState(initialPrText ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(initialName);
  const [editPrText, setEditPrText] = useState(initialPrText ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // アイコン変更(選択→円形クロップ→即保存)
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // リール投稿フォーム
  const [formOpen, setFormOpen] = useState(false);
  const [postType, setPostType] = useState<"reel" | "story">("reel");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const postCount = reels.length;
  const totalLikes = reels.reduce((sum, r) => sum + r.likesCount, 0);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }

    const validationError = await validateReelFile(f);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));

    if (f.type.startsWith("video/")) {
      setOptimizing(true);
      const optimized = await optimizeReelVideo(f);
      setOptimizing(false);
      setFile(optimized);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(optimized);
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("写真か動画を選んでください");
      return;
    }
    setUploading(true);
    setError(null);

    const supabase = createClient();
    const isVideo = file.type.startsWith("video/");
    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const path = `${castId}/${Date.now()}.${ext}`;

    // リール(ストーリー以外)の動画は、マップのカード用の軽量プレビューも並行して作る。
    // ストーリーはフォロワー限定・24時間で消えるのでカードには使われない。
    const [{ error: uploadError }, previewUrl] = await Promise.all([
      supabase.storage.from("reels").upload(path, file, { contentType: file.type }),
      isVideo && postType !== "story" ? uploadReelPreview(supabase, castId, file) : Promise.resolve(null),
    ]);

    if (uploadError) {
      setUploading(false);
      setError(`アップロードに失敗しました: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("reels").getPublicUrl(path);
    const media = [{ type: isVideo ? "video" : "image", url: publicUrlData.publicUrl }];

    if (postType === "story") {
      const { data: insertedStory, error: insertError } = await supabase
        .from("reels")
        .insert({
          cast_id: castId,
          shop_id: shopId,
          post_type: "story",
          caption: caption.trim() || null,
          media,
        })
        .select("id, media, created_at, expires_at")
        .single();

      setUploading(false);

      if (insertError || !insertedStory) {
        setError(`投稿の保存に失敗しました: ${insertError?.message ?? ""}`);
        return;
      }

      setStories((prev) => [
        {
          id: insertedStory.id,
          media: insertedStory.media as MyStory["media"],
          createdAt: insertedStory.created_at,
          expiresAt: insertedStory.expires_at!,
        },
        ...prev,
      ]);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("reels")
        .insert({
          cast_id: castId,
          shop_id: shopId,
          caption: caption.trim() || null,
          link_url: linkUrl.trim() || null,
          is_comments_enabled: commentsEnabled,
          media,
          preview_url: previewUrl,
        })
        .select("id, caption, media, likes_count, created_at, is_comments_enabled")
        .single();

      setUploading(false);

      if (insertError || !inserted) {
        setError(`投稿の保存に失敗しました: ${insertError?.message ?? ""}`);
        return;
      }

      setReels((prev) => [
        {
          id: inserted.id,
          caption: inserted.caption,
          media: inserted.media as MyReel["media"],
          likesCount: inserted.likes_count,
          createdAt: inserted.created_at,
          isCommentsEnabled: inserted.is_comments_enabled,
          pinnedAt: null,
        },
        ...prev,
      ]);
    }

    setFile(null);
    setPreview(null);
    setCaption("");
    setLinkUrl("");
    setCommentsEnabled(true);
    setPostType("reel");
    setFormOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  async function handleDeleteStory(storyId: string) {
    if (!confirm("このストーリーを削除しますか?")) return;
    const supabase = createClient();
    setStories((prev) => prev.filter((s) => s.id !== storyId));
    await supabase.from("reels").delete().eq("id", storyId);
  }

  async function handleDelete(reelId: string) {
    const supabase = createClient();
    const { data, error: deleteError } = await supabase
      .from("reels")
      .delete()
      .eq("id", reelId)
      .select("id");

    if (deleteError || !data || data.length === 0) {
      setError("削除に失敗しました");
      return;
    }
    setReels((prev) => prev.filter((r) => r.id !== reelId));
  }

  async function handleToggleComments(reelId: string, next: boolean) {
    setReels((prev) => prev.map((r) => (r.id === reelId ? { ...r, isCommentsEnabled: next } : r)));
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("reels")
      .update({ is_comments_enabled: next })
      .eq("id", reelId);
    if (updateError) {
      setReels((prev) => prev.map((r) => (r.id === reelId ? { ...r, isCommentsEnabled: !next } : r)));
      setError("コメント設定の変更に失敗しました");
    }
  }

  async function handleTogglePin(reelId: string, currentlyPinned: boolean) {
    if (!currentlyPinned && reels.filter((r) => r.pinnedAt).length >= MAX_PINNED_REELS) {
      setError(`ピン留めは最大${MAX_PINNED_REELS}件までです`);
      return;
    }

    const nextPinnedAt = currentlyPinned ? null : new Date().toISOString();
    const prevReels = reels;
    setReels((prev) => prev.map((r) => (r.id === reelId ? { ...r, pinnedAt: nextPinnedAt } : r)));

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("reels")
      .update({ pinned_at: nextPinnedAt })
      .eq("id", reelId);

    if (updateError) {
      setReels(prevReels);
      setError("ピン留めの変更に失敗しました");
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/cast/login");
    router.refresh();
  }

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) setPendingAvatarFile(f);
    e.target.value = "";
  }

  async function handleAvatarCropped(blob: Blob) {
    setPendingAvatarFile(null);
    setAvatarUploading(true);
    setProfileError(null);

    const supabase = createClient();
    const path = `${castId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, {
      contentType: "image/jpeg",
    });

    if (uploadError) {
      setAvatarUploading(false);
      setProfileError(`アイコンのアップロードに失敗しました: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const newAvatarUrl = publicUrlData.publicUrl;

    const { error: rpcError } = await supabase.rpc("update_own_cast_profile", {
      p_name: name,
      p_pr_text: prText,
      p_avatar_url: newAvatarUrl,
    });

    setAvatarUploading(false);

    if (rpcError) {
      setProfileError(`アイコンの保存に失敗しました: ${rpcError.message}`);
      return;
    }

    setAvatarUrl(newAvatarUrl);
    router.refresh();
  }

  function openEditSheet() {
    setEditName(name);
    setEditPrText(prText);
    setProfileError(null);
    setEditOpen(true);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) {
      setProfileError("名前を入力してください");
      return;
    }
    setProfileSaving(true);
    setProfileError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("update_own_cast_profile", {
      p_name: editName.trim(),
      p_pr_text: editPrText.trim(),
    });

    setProfileSaving(false);

    if (rpcError) {
      setProfileError(`プロフィールの保存に失敗しました: ${rpcError.message}`);
      return;
    }

    setName(editName.trim());
    setPrText(editPrText.trim());
    setEditOpen(false);
    router.refresh();
  }

  return (
    <div className="pb-8">
      {/* ストーリー(24時間で自動的に消える、フォロワー限定の投稿)。本人には常に見える。 */}
      {stories.length > 0 && (
        <section className="flex gap-3 overflow-x-auto px-4 pt-4 no-scrollbar">
          {stories.map((s) => {
            const thumb = s.media[0];
            return (
              <div key={s.id} className="relative flex-shrink-0">
                <div className="rounded-full bg-gradient-to-tr from-yellow-400 via-rose-500 to-purple-600 p-[2px]">
                  <div className="rounded-full bg-black p-[2px]">
                    {thumb?.type === "video" ? (
                      <video src={thumb.url} className="h-14 w-14 rounded-full object-cover" muted />
                    ) : thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb.url} alt="" className="h-14 w-14 rounded-full object-cover" />
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteStory(s.id)}
                  aria-label="ストーリーを削除"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-black bg-neutral-700 text-white"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* プロフィールヘッダー(Instagramのプロフィール画面と同じ構成) */}
      <section className="px-4 pt-6 text-center">
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAvatarFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarUploading}
          aria-label="アイコン画像を変更"
          className="relative mx-auto block h-20 w-20 rounded-full disabled:opacity-60"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-20 w-20 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-neutral-800 text-2xl font-semibold text-neutral-500">
              {name.slice(0, 1)}
            </div>
          )}
          <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-brand text-white">
            <Camera size={12} />
          </span>
        </button>

        <h1 className="mt-3 text-lg font-bold">{name}</h1>
        {shopName && <p className="text-xs text-neutral-400">{shopName}</p>}

        <div className="mt-4 flex justify-center gap-8">
          <div className="text-center">
            <p className="text-base font-bold">{postCount}</p>
            <p className="text-[11px] text-neutral-400">投稿</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold">{totalLikes}</p>
            <p className="text-[11px] text-neutral-400">いいね</p>
          </div>
        </div>

        {prText && (
          <p className="mx-auto mt-3 max-w-xs whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
            {prText}
          </p>
        )}

        {profileError && <p className="mt-2 text-sm text-red-400">{profileError}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            ＋ 新規投稿
          </button>
          <button
            type="button"
            onClick={openEditSheet}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/20 py-2 text-sm text-neutral-200"
          >
            <Pencil size={13} /> プロフィール編集
          </button>
        </div>

        {/* インスタのプロフィール欄などに貼るための短縮URL。
            /cast/[uuid]は長すぎて改行・文字数制限にかかるため、6桁の短縮コードを案内する。 */}
        <div className="mx-auto mt-4 max-w-xs rounded-lg border border-white/10 bg-neutral-900 p-3 text-left">
          <p className="text-[11px] font-semibold text-neutral-300">
            あなたの公開プロフィールURL(インスタ等に貼る用)
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={`https://luxela.jp/c/${castCode}`}
              className="w-full rounded border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-white"
            />
            <CopyButton value={`https://luxela.jp/c/${castCode}`} />
          </div>
          <div className="mt-2">
            <RevealableQr qrDataUrl={qrDataUrl} label="QRコードを表示(お客様にその場で見せる用)" />
          </div>
        </div>
      </section>

      {/* 投稿フォーム */}
      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mx-4 mt-4 space-y-3 rounded-xl border border-white/10 bg-neutral-900 p-4"
        >
          <div className="flex rounded-full border border-white/20 bg-white/5 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setPostType("reel")}
              className={`flex-1 rounded-full py-1.5 transition ${
                postType === "reel" ? "bg-brand text-white" : "text-neutral-400"
              }`}
            >
              リール
            </button>
            <button
              type="button"
              onClick={() => setPostType("story")}
              className={`flex-1 rounded-full py-1.5 transition ${
                postType === "story" ? "bg-gold text-black" : "text-neutral-400"
              }`}
            >
              ストーリー(24時間)
            </button>
          </div>
          <p className="text-[11px] text-neutral-500">
            {postType === "reel"
              ? "ポータル全体に公開され、ずっと残ります。"
              : "フォロワーだけに見え、24時間で自動的に消えます。"}
          </p>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-white/20 bg-white/5 px-4 py-6 text-center transition hover:border-brand">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {preview ? (
              file?.type.startsWith("video/") ? (
                <video src={preview} className="mx-auto max-h-64 w-full rounded-lg object-cover" controls />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="mx-auto max-h-64 w-full rounded-lg object-cover" />
              )
            ) : (
              <span className="text-sm font-medium text-neutral-300">写真・動画を選択</span>
            )}
          </label>
          <p className="text-xs text-neutral-500">
            ※カメラロールから選ぶか、その場で撮影できます。写真1枚または動画1本を投稿できます。
          </p>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="ひとことコメントを入力"
            rows={2}
            className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white placeholder:text-neutral-500"
          />
          {postType === "reel" && (
            <>
              <div>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="リンク先URL(任意)"
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white placeholder:text-neutral-500"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  空欄なら通常のリンク先(自分のリール一覧)になります。入力するとタップ時にそのURLへ飛びます。
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={commentsEnabled}
                  onChange={(e) => setCommentsEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                コメントを許可する
              </label>
            </>
          )}
          {optimizing && (
            <p className="text-xs text-neutral-400">動画をスマホ向けに最適化しています…</p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={uploading || optimizing}
              className="flex-1 rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {uploading ? "投稿中..." : optimizing ? "最適化中..." : "投稿する"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setFile(null);
                setPreview(null);
                setPostType("reel");
              }}
              className="rounded border border-white/20 px-4 py-2 text-sm text-neutral-300"
            >
              やめる
            </button>
          </div>
        </form>
      )}

      {/* 投稿グリッド(ピン留めした投稿を先頭に固定表示) */}
      <div className="mt-6 grid grid-cols-3 gap-1 border-t border-white/10 pt-1">
        {[...reels]
          .sort((a, b) => {
            if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt);
            if (a.pinnedAt) return -1;
            if (b.pinnedAt) return 1;
            return 0;
          })
          .map((r) => (
            <Link
              key={r.id}
              href={`/cast/${castId}/reels?start=${r.id}`}
              className="relative block aspect-[9/16] overflow-hidden bg-neutral-900"
            >
              {r.media[0]?.type === "video" ? (
                <video src={r.media[0].url} className="h-full w-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.media[0]?.url} alt="" className="h-full w-full object-cover" />
              )}
              {r.pinnedAt && (
                <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-gold px-1.5 py-0.5 text-[10px] font-semibold text-black">
                  <Pin size={10} className="fill-black" /> 固定
                </span>
              )}
              <div className="absolute right-1 top-1 flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(r.id);
                  }}
                  className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                >
                  削除
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleTogglePin(r.id, !!r.pinnedAt);
                  }}
                  className="flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                >
                  {r.pinnedAt ? (
                    <>
                      <PinOff size={10} /> ピン解除
                    </>
                  ) : (
                    <>
                      <Pin size={10} /> ピン留め
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggleComments(r.id, !r.isCommentsEnabled);
                  }}
                  className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                >
                  {r.isCommentsEnabled ? "コメント:許可" : "コメント:停止中"}
                </button>
              </div>
              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                ♥ {r.likesCount}
              </span>
            </Link>
          ))}
      </div>
      {reels.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-neutral-500">
          まだ投稿がありません。上のボタンから最初の1本を投稿してみましょう。
        </p>
      )}

      <CastCommentsPanel castId={castId} />

      <button
        type="button"
        onClick={handleLogout}
        className="mx-auto mt-6 block text-xs text-neutral-500 underline"
      >
        ログアウト
      </button>

      {/* プロフィール編集シート(Instagram風スライドイン) */}
      {editOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-neutral-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <button type="button" onClick={() => setEditOpen(false)} className="text-sm text-neutral-400">
                キャンセル
              </button>
              <h2 className="text-sm font-semibold">プロフィールを編集</h2>
              <span className="w-10" />
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-lg font-semibold text-neutral-500">
                    {name.slice(0, 1)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="text-sm text-brand disabled:opacity-50"
                >
                  {avatarUploading ? "アップロード中..." : "写真を変更"}
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">名前</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={50}
                  required
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">自己紹介</label>
                <textarea
                  value={editPrText}
                  onChange={(e) => setEditPrText(e.target.value)}
                  rows={4}
                  maxLength={600}
                  placeholder="出勤時間帯やSNSリンクなど"
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white placeholder:text-neutral-500"
                />
              </div>

              {profileError && <p className="text-sm text-red-400">{profileError}</p>}

              <button
                type="submit"
                disabled={profileSaving}
                className="w-full rounded bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {profileSaving ? "保存中..." : "保存する"}
              </button>
            </form>
          </div>
        </div>
      )}

      {pendingAvatarFile && (
        <AvatarCropModal
          file={pendingAvatarFile}
          onCancel={() => setPendingAvatarFile(null)}
          onCropped={handleAvatarCropped}
        />
      )}
    </div>
  );
}
