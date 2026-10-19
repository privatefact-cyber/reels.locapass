"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { usePhotoViewer } from "@/components/photo/useViewer";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * 写真の削除ボタン。出るのは「投稿した本人」と「ルート管理者」にだけ(見た目の出し分け。
 * 実際の権限確認は削除API(DELETE /api/photo/posts/[id])がサーバーで行う)。
 * variant "icon" は全画面表示の上に重ねる丸いボタン、"text" は投稿カードの操作行に並べる文字ボタン。
 */
export function PhotoDeleteButton({
  post,
  onDeleted,
  variant = "text",
}: {
  post: PhotoPost;
  onDeleted: (postId: string) => void;
  variant?: "icon" | "text";
}) {
  const { t } = useLocale();
  const viewer = usePhotoViewer();
  const [busy, setBusy] = useState(false);

  const canDelete = !!viewer?.userId && (post.memberId === viewer.userId || viewer.isRootAdmin);
  if (!canDelete) return null;

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy || !window.confirm(t.photo.deleteConfirm)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/photo/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        window.alert(data?.error ?? t.photo.deleteFailed);
        return;
      }
      onDeleted(post.id);
    } catch {
      window.alert(t.photo.deleteFailed);
    } finally {
      setBusy(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label={t.photo.deleteButton}
        className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur disabled:opacity-50"
        style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <Trash2 size={20} />
      </button>
    );
  }
  return (
    <button type="button" onClick={remove} disabled={busy} className="ml-auto flex items-center gap-1 text-xs text-tone-400 hover:text-red-400 disabled:opacity-50">
      <Trash2 size={14} />
      {t.photo.deleteButton}
    </button>
  );
}
