"use client";

import { Download } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { usePhotoViewer } from "@/components/photo/useViewer";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * 動画の保存(ダウンロード)ボタン。出るのは動画の投稿で、「投稿した本人」と「ルート管理者」にだけ
 * (見た目の出し分け。実際の権限確認は GET /api/photo/posts/[id]/download がサーバーで行う)。
 * インフルエンサーが自分の過去の動画を手元に保存できる(管理用のバックアップ)。
 */
export function PhotoDownloadButton({ post }: { post: PhotoPost }) {
  const { t } = useLocale();
  const viewer = usePhotoViewer();
  const canDownload = !!post.videoUrl && !!viewer?.userId && (post.memberId === viewer.userId || viewer.isRootAdmin);
  if (!canDownload) return null;
  return (
    <a
      href={`/api/photo/posts/${post.id}/download`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 hover:text-main"
    >
      <Download size={16} />
      {t.photo.downloadVideo}
    </a>
  );
}
