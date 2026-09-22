"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { SingleImageDropzone, EventGalleryDropzone } from "@/components/locapass-dashboard/EventImageDropzone";
import { TimeOfDaySelect } from "@/components/locapass-dashboard/TimeOfDaySelect";
import { formatEventDateRange } from "@/lib/events/formatEventDateRange";
import { validateReelFile } from "@/lib/reels/prepareReelFile";
import { transcodeReelVideo } from "@/lib/reels/transcodeReelVideo";
import { uploadReelPreview } from "@/lib/reels/uploadReelPreview";
import { uploadToStream } from "@/lib/stream/uploadToStream";
import { streamPlaybackUrl } from "@/lib/stream/playback";
import { StreamThumb } from "@/components/video/StreamThumb";

export type MyReel = {
  id: string;
  caption: string | null;
  media: { type: "video" | "image"; url: string }[];
  likesCount: number;
  createdAt: string;
};

export type ShopEventRow = {
  id: string;
  title: string;
  body: string | null;
  startsAt: string | null;
  endsAt: string | null;
  imageUrl: string | null;
  galleryImageUrls: string[];
  isOwn: boolean;
  isEnded: boolean;
};

export type InquiryRow = {
  id: string;
  customerName: string | null;
  contact: string | null;
  status: string;
  updatedAt: string;
};

type ThreadMessage = { senderType: "customer" | "shop"; body: string; createdAt: string };
type ReelComment = { id: string; authorType: "customer" | "staff"; body: string; createdAt: string };

function parseTimeOfDay(value: string): string | null {
  return value.trim() || null;
}

function toJstIso(date: string, time: string | null, fallbackTime: string): string | null {
  if (!date) return null;
  return `${date}T${time ?? fallbackTime}:00+09:00`;
}

const STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  responded: "対応済み",
  closed: "クローズ",
};

type Tab = "posts" | "events" | "inquiries";

/**
 * スタッフ本人の画面(/dashboard/staff)。LUXELA本家のスタッフマイページ(StaffMypageClient)と同じUI。
 * プロフィール(locapass_update_own_staff_profile)・リール(locapass_reels.posted_by_staff_id)・
 * コメント(locapass_reel_comments)・イベント(locapass_shop_events)・お問い合わせ(locapass_shop_inquiry_messages)に
 * つないである。
 */
export function StaffDashboardClient({
  userId,
  portalId,
  staffId,
  shopId,
  shopName,
  initialName,
  initialBio,
  initialAvatarUrl,
  initialReels,
  initialEvents,
  initialInquiries,
}: {
  userId: string;
  portalId: number;
  staffId: string;
  shopId: string;
  shopName: string | null;
  initialName: string;
  initialBio: string | null;
  initialAvatarUrl: string | null;
  initialReels: MyReel[];
  initialEvents: ShopEventRow[];
  initialInquiries: InquiryRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("posts");
  const [reels, setReels] = useState(initialReels);
  const [events, setEvents] = useState(initialEvents);
  const [inquiries, setInquiries] = useState(initialInquiries);

  // プロフィール
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(initialName);
  const [editBio, setEditBio] = useState(initialBio ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // リール投稿
  const [formOpen, setFormOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // コメント(投稿ごとに開閉)
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, ReelComment[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  // イベント投稿
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventThumbnailUrl, setEventThumbnailUrl] = useState<string | null>(null);
  const [eventGalleryKey, setEventGalleryKey] = useState(0);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  // お問い合わせ
  const [openInquiryId, setOpenInquiryId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);

  const postCount = reels.length;
  const totalLikes = reels.reduce((sum, r) => sum + r.likesCount, 0);

  // ---------- プロフィール ----------
  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) setPendingAvatarFile(f);
    e.target.value = "";
  }

  async function handleAvatarCropped(blob: Blob) {
    setPendingAvatarFile(null);
    setAvatarUploading(true);
    setProfileError(null);

    // アイコンは本人フォルダ(auth.uid())配下にだけ置ける locapass-ugc バケットに保存する。
    const supabase = createClient();
    const path = `${userId}/staff-avatar-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("locapass-ugc").upload(path, blob, {
      contentType: "image/jpeg",
    });

    if (uploadError) {
      setAvatarUploading(false);
      setProfileError(`アイコンのアップロードに失敗しました: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("locapass-ugc").getPublicUrl(path);
    const newAvatarUrl = publicUrlData.publicUrl;

    const { error: rpcError } = await supabase.rpc("locapass_update_own_staff_profile", {
      p_name: name,
      p_bio: bio,
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
    setEditBio(bio);
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
    const { error: rpcError } = await supabase.rpc("locapass_update_own_staff_profile", {
      p_name: editName.trim(),
      p_bio: editBio.trim(),
    });

    setProfileSaving(false);
    if (rpcError) {
      setProfileError(`プロフィールの保存に失敗しました: ${rpcError.message}`);
      return;
    }

    setName(editName.trim());
    setBio(editBio.trim());
    setEditOpen(false);
    router.refresh();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // ---------- リール投稿 ----------
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
      const optimized = await transcodeReelVideo(f);
      setOptimizing(false);
      setFile(optimized);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(optimized);
      });
    }
  }

  async function handleSubmitReel(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("写真か動画を選んでください");
      return;
    }
    setUploading(true);
    setError(null);

    // 店舗フォルダ配下(locapass-reelsバケット)に置き、locapass_reels に店舗のリールとして登録する。
    // 投稿者(created_by)はDBのトリガーで本人に固定される。
    const supabase = createClient();
    const isVideo = file.type.startsWith("video/");
    let videoUrl: string | null = null;
    let imageUrl: string | null = null;
    let previewUrl: string | null = null;

    if (isVideo) {
      // 動画本体はブラウザからCloudflare StreamへTUS直送する。Supabase Storageは通さない。
      // マップのカード用の軽量プレビューは元ファイルから並行して作る(失敗しても投稿は続ける)。
      try {
        const [uid, preview] = await Promise.all([
          uploadToStream(file),
          uploadReelPreview(supabase, shopId, file),
        ]);
        const playbackUrl = streamPlaybackUrl(uid);
        if (!playbackUrl) throw new Error("Cloudflare Stream の公開設定が不足しています");
        videoUrl = playbackUrl;
        previewUrl = preview;
      } catch (cause) {
        setUploading(false);
        setError(`アップロードに失敗しました: ${cause instanceof Error ? cause.message : "通信を確認して再試行してください"}`);
        return;
      }
    } else {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${shopId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("locapass-reels")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        setUploading(false);
        setError(`アップロードに失敗しました: ${uploadError.message}`);
        return;
      }
      const { data: publicUrlData } = supabase.storage.from("locapass-reels").getPublicUrl(path);
      imageUrl = publicUrlData.publicUrl;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("locapass_reels")
      .insert({
        posted_by_staff_id: staffId,
        shop_id: shopId,
        portal_id: portalId,
        caption: caption.trim() || null,
        action_url: linkUrl.trim() || null,
        video_url: videoUrl,
        images: imageUrl ? [{ url: imageUrl }] : [],
        author_name: name,
        author_icon_url: avatarUrl,
        reel_type: "permanent",
        status: "publish",
        preview_url: previewUrl,
      })
      .select("id, caption, like_count, published_at, updated_at")
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
        media: [{ type: isVideo ? "video" : "image", url: (videoUrl ?? imageUrl)! }],
        likesCount: inserted.like_count,
        createdAt: inserted.published_at ?? inserted.updated_at,
      },
      ...prev,
    ]);
    setFile(null);
    setPreview(null);
    setCaption("");
    setLinkUrl("");
    setFormOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  async function handleDeleteReel(reelId: string) {
    const supabase = createClient();
    const { data, error: deleteError } = await supabase
      .from("locapass_reels")
      .delete()
      .eq("id", reelId)
      .select("id");

    if (deleteError || !data || data.length === 0) {
      setError("削除に失敗しました");
      return;
    }
    setReels((prev) => prev.filter((r) => r.id !== reelId));
  }

  // ---------- コメント ----------
  async function toggleComments(reelId: string) {
    if (openCommentsFor === reelId) {
      setOpenCommentsFor(null);
      return;
    }
    setOpenCommentsFor(reelId);
    setCommentDraft("");
    if (!comments[reelId]) {
      const supabase = createClient();
      const { data } = await supabase
        .from("locapass_reel_comments")
        .select("id, author_type, body, created_at")
        .eq("reel_id", reelId)
        .order("created_at", { ascending: true });
      setComments((prev) => ({
        ...prev,
        [reelId]: (data ?? []).map((c) => ({
          id: c.id,
          authorType: c.author_type as "customer" | "staff",
          body: c.body,
          createdAt: c.created_at,
        })),
      }));
    }
  }

  async function handleReplyComment(reelId: string) {
    if (!commentDraft.trim()) return;
    setCommentLoading(true);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("locapass_reel_comments")
      .insert({
        reel_id: reelId,
        author_type: "staff",
        staff_member_id: staffId,
        body: commentDraft.trim(),
      })
      .select("id, author_type, body, created_at")
      .single();

    setCommentLoading(false);
    if (insertError || !data) return;

    setComments((prev) => ({
      ...prev,
      [reelId]: [
        ...(prev[reelId] ?? []),
        { id: data.id, authorType: "staff", body: data.body, createdAt: data.created_at },
      ],
    }));
    setCommentDraft("");
  }

  // ---------- イベント投稿 ----------
  async function handleSubmitEvent(formData: FormData) {
    setEventSaving(true);
    setEventError(null);

    const title = String(formData.get("title") ?? "").trim();
    const bodyText = String(formData.get("body") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "").trim();
    const startTime = parseTimeOfDay(String(formData.get("start_time") ?? ""));
    const endDate = String(formData.get("end_date") ?? "").trim();
    const endTime = parseTimeOfDay(String(formData.get("end_time") ?? ""));
    const galleryRaw = String(formData.get("gallery_image_urls") ?? "").trim();

    if (!title) {
      setEventSaving(false);
      setEventError("タイトルは必須です");
      return;
    }
    if (!eventThumbnailUrl) {
      setEventSaving(false);
      setEventError("サムネイル画像は必須です");
      return;
    }

    let galleryImageUrls: string[] = [];
    if (galleryRaw) {
      try {
        const parsed = JSON.parse(galleryRaw);
        if (Array.isArray(parsed)) galleryImageUrls = parsed.filter((u) => typeof u === "string");
      } catch {
        // ignore
      }
    }

    const startsAt = toJstIso(startDate, startTime, "00:00");
    const endsAt = toJstIso(endDate, endTime, "23:45");

    const supabase = createClient();
    const { data: inserted, error: insertError } = await supabase
      .from("locapass_shop_events")
      .insert({
        shop_id: shopId,
        created_by_staff_id: staffId,
        title,
        body: bodyText || null,
        starts_at: startsAt,
        ends_at: endsAt,
        image_url: eventThumbnailUrl,
        gallery_image_urls: galleryImageUrls,
      })
      .select("id, title, body, starts_at, ends_at, image_url, gallery_image_urls, created_at")
      .single();

    setEventSaving(false);
    if (insertError || !inserted) {
      setEventError(`イベントの登録に失敗しました: ${insertError?.message ?? ""}`);
      return;
    }

    setEvents((prev) => [
      {
        id: inserted.id,
        title: inserted.title,
        body: inserted.body,
        startsAt: inserted.starts_at,
        endsAt: inserted.ends_at,
        imageUrl: inserted.image_url,
        galleryImageUrls: inserted.gallery_image_urls ?? [],
        isOwn: true,
        isEnded: false,
      },
      ...prev,
    ]);
    setEventThumbnailUrl(null);
    setEventGalleryKey((k) => k + 1);
    setEventFormOpen(false);
    router.refresh();
  }

  async function handleDeleteEvent(eventId: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("locapass_shop_events").delete().eq("id", eventId);
    if (deleteError) return;
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }

  // ---------- お問い合わせ ----------
  async function openInquiry(inquiryId: string) {
    if (openInquiryId === inquiryId) {
      setOpenInquiryId(null);
      return;
    }
    setOpenInquiryId(inquiryId);
    setThreadLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("locapass_shop_inquiry_messages")
      .select("sender_type, body, created_at")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true });
    setThread(
      (data ?? []).map((m) => ({
        senderType: m.sender_type as "customer" | "shop",
        body: m.body,
        createdAt: m.created_at,
      })),
    );
    setThreadLoading(false);
  }

  async function handleReplyInquiry(inquiryId: string) {
    if (!replyDraft.trim()) return;
    setReplySending(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("locapass_shop_inquiry_messages").insert({
      inquiry_id: inquiryId,
      sender_type: "shop",
      staff_member_id: staffId,
      body: replyDraft.trim(),
    });

    setReplySending(false);
    if (insertError) return;

    setThread((prev) => [
      ...prev,
      { senderType: "shop", body: replyDraft.trim(), createdAt: new Date().toISOString() },
    ]);
    setInquiries((prev) =>
      prev.map((i) => (i.id === inquiryId ? { ...i, status: "responded" } : i)),
    );
    setReplyDraft("");
  }

  return (
    <div className="pb-8">
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
            <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full border border-white/10 object-cover" />
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
        {shopName && <p className="text-xs text-neutral-400">{shopName} スタッフ</p>}

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

        {bio && (
          <p className="mx-auto mt-3 max-w-xs whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
            {bio}
          </p>
        )}

        {profileError && <p className="mt-2 text-sm text-red-400">{profileError}</p>}

        <button
          type="button"
          onClick={openEditSheet}
          className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg border border-white/20 py-2 text-sm text-neutral-200"
        >
          <Pencil size={13} /> プロフィール編集
        </button>
      </section>

      {/* タブ */}
      <div className="mt-6 flex border-t border-b border-white/10 text-sm">
        {(
          [
            ["posts", "投稿"],
            ["events", "イベント"],
            ["inquiries", "お問い合わせ"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 py-2.5 font-semibold ${
              tab === key ? "border-b-2 border-brand text-white" : "text-neutral-500"
            }`}
          >
            {label}
            {key === "inquiries" && inquiries.some((i) => i.status === "open") && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />
            )}
          </button>
        ))}
      </div>

      {/* 投稿タブ */}
      {tab === "posts" && (
        <div>
          <div className="px-4 pt-4">
            <button
              type="button"
              onClick={() => setFormOpen((v) => !v)}
              className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              ＋ 新規投稿
            </button>
          </div>

          {formOpen && (
            <form
              onSubmit={handleSubmitReel}
              className="mx-4 mt-4 space-y-3 rounded-xl border border-white/10 bg-neutral-900 p-4"
            >
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
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="ひとことコメントを入力"
                rows={2}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white placeholder:text-neutral-500"
              />
              <div>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="リンク先URL(任意)"
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white placeholder:text-neutral-500"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  空欄なら通常のリンク先(店舗のリール一覧)になります。入力するとタップ時にそのURLへ飛びます。
                </p>
              </div>
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
                  }}
                  className="rounded border border-white/20 px-4 py-2 text-sm text-neutral-300"
                >
                  やめる
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 space-y-4 px-4">
            {reels.map((r) => (
              <div key={r.id} className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
                <div className="relative aspect-[9/16] max-h-96 bg-black">
                  {r.media[0]?.type === "video" ? (
                    <StreamThumb url={r.media[0].url} className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.media[0]?.url} alt="" className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteReel(r.id)}
                    className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white"
                  >
                    削除
                  </button>
                  <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white">
                    ♥ {r.likesCount}
                  </span>
                </div>
                {r.caption && <p className="px-3 pt-2 text-sm text-neutral-300">{r.caption}</p>}
                <button
                  type="button"
                  onClick={() => toggleComments(r.id)}
                  className="w-full px-3 py-2 text-left text-xs text-neutral-400"
                >
                  {openCommentsFor === r.id ? "コメントを閉じる" : "コメントを見る・返信する"}
                </button>
                {openCommentsFor === r.id && (
                  <div className="space-y-2 border-t border-white/10 px-3 py-3">
                    {(comments[r.id] ?? []).length === 0 && (
                      <p className="text-xs text-neutral-500">まだコメントはありません。</p>
                    )}
                    {(comments[r.id] ?? []).map((c) => (
                      <div key={c.id} className="text-xs">
                        <span className={c.authorType === "staff" ? "font-semibold text-brand" : "font-semibold text-neutral-300"}>
                          {c.authorType === "staff" ? "自分" : "ゲスト"}
                        </span>
                        <span className="ml-2 text-neutral-300">{c.body}</span>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <input
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder="返信を入力"
                        className="flex-1 rounded border border-white/20 bg-white/5 px-2 py-1.5 text-[13px] text-white"
                      />
                      <button
                        type="button"
                        disabled={commentLoading}
                        onClick={() => handleReplyComment(r.id)}
                        className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        送信
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {reels.length === 0 && (
              <p className="py-8 text-center text-sm text-neutral-500">
                まだ投稿がありません。上のボタンから最初の1本を投稿してみましょう。
              </p>
            )}
          </div>
        </div>
      )}

      {/* イベントタブ */}
      {tab === "events" && (
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => setEventFormOpen((v) => !v)}
            className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            ＋ イベントを投稿
          </button>

          {eventFormOpen && (
            <form
              key={eventGalleryKey}
              action={handleSubmitEvent}
              className="mt-4 space-y-3 rounded-xl border border-white/10 bg-neutral-900 p-4"
            >
              <input
                name="title"
                required
                placeholder="タイトル"
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-neutral-400">開始日</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      name="start_date"
                      type="date"
                      className="flex-1 rounded border border-white/20 bg-white/5 px-2 py-2 text-sm text-white"
                    />
                    <TimeOfDaySelect
                      name="start_time"
                      className="rounded border border-white/20 bg-white/5 px-2 py-2 text-sm text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-400">終了日</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      name="end_date"
                      type="date"
                      className="flex-1 rounded border border-white/20 bg-white/5 px-2 py-2 text-sm text-white"
                    />
                    <TimeOfDaySelect
                      name="end_time"
                      className="rounded border border-white/20 bg-white/5 px-2 py-2 text-sm text-white"
                    />
                  </div>
                </div>
              </div>

              <SingleImageDropzone
                shopId={shopId}
                name="image_url"
                label="サムネイル画像(必須)"
                onChange={setEventThumbnailUrl}
              />
              <EventGalleryDropzone shopId={shopId} name="gallery_image_urls" />

              <textarea
                name="body"
                placeholder="詳細(任意)"
                rows={3}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-[16px] text-white"
              />

              {eventError && <p className="text-sm text-red-400">{eventError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={eventSaving || !eventThumbnailUrl}
                  className="flex-1 rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {eventSaving ? "投稿中..." : "投稿する"}
                </button>
                <button
                  type="button"
                  onClick={() => setEventFormOpen(false)}
                  className="rounded border border-white/20 px-4 py-2 text-sm text-neutral-300"
                >
                  やめる
                </button>
              </div>
            </form>
          )}

          <ul className="mt-4 space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="flex gap-3 rounded-xl border border-white/10 bg-neutral-900 p-3">
                {ev.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.imageUrl} alt={ev.title} className="h-16 w-12 shrink-0 rounded object-cover" />
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">
                      {ev.title}
                      {ev.isEnded && (
                        <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400">終了</span>
                      )}
                      {!ev.isOwn && (
                        <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400">他スタッフ投稿</span>
                      )}
                    </span>
                    {ev.isOwn && (
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="text-xs text-neutral-500 hover:text-red-400"
                      >
                        削除
                      </button>
                    )}
                  </div>
                  {formatEventDateRange(ev) && (
                    <p className="text-xs text-neutral-500">{formatEventDateRange(ev)}</p>
                  )}
                </div>
              </li>
            ))}
            {events.length === 0 && (
              <p className="py-8 text-center text-sm text-neutral-500">まだイベントはありません。</p>
            )}
          </ul>
        </div>
      )}

      {/* お問い合わせタブ */}
      {tab === "inquiries" && (
        <div className="px-4 pt-4">
          <ul className="space-y-2">
            {inquiries.map((inq) => (
              <li key={inq.id} className="rounded-xl border border-white/10 bg-neutral-900">
                <button
                  type="button"
                  onClick={() => openInquiry(inq.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{inq.customerName || "名前未入力"}</p>
                    <p className="text-xs text-neutral-500">{inq.contact || "連絡先未入力"}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      inq.status === "open"
                        ? "bg-amber-500/20 text-amber-300"
                        : inq.status === "responded"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-white/10 text-neutral-400"
                    }`}
                  >
                    {STATUS_LABEL[inq.status] ?? inq.status}
                  </span>
                </button>

                {openInquiryId === inq.id && (
                  <div className="space-y-2 border-t border-white/10 p-3">
                    {threadLoading ? (
                      <p className="text-xs text-neutral-500">読み込み中...</p>
                    ) : (
                      thread.map((m, i) => (
                        <div
                          key={i}
                          className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs ${
                            m.senderType === "shop"
                              ? "ml-auto bg-brand text-white"
                              : "mr-auto bg-white/10 text-neutral-200"
                          }`}
                        >
                          {m.body}
                        </div>
                      ))
                    )}
                    <div className="flex gap-2 pt-1">
                      <input
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder="返信を入力"
                        className="flex-1 rounded border border-white/20 bg-white/5 px-2 py-1.5 text-[13px] text-white"
                      />
                      <button
                        type="button"
                        disabled={replySending}
                        onClick={() => handleReplyInquiry(inq.id)}
                        className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        送信
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
            {inquiries.length === 0 && (
              <p className="py-8 text-center text-sm text-neutral-500">まだお問い合わせはありません。</p>
            )}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={handleLogout}
        className="mx-auto mt-6 block text-xs text-neutral-500 underline"
      >
        ログアウト
      </button>

      {/* プロフィール編集シート */}
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
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={4}
                  maxLength={600}
                  placeholder="担当曜日やひとことなど"
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
