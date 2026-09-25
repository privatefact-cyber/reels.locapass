"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, LogOut, MessageCircle, Play, Settings, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { NotificationBell } from "@/components/NotificationBell";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { StreamVideo } from "@/components/video/StreamVideo";
import { streamThumbnailFromManifestUrl } from "@/lib/stream/playback";

export type SavedReel = {
  id: string;
  caption: string | null;
  media: { type: "video" | "image"; url: string; poster?: string }[];
  likesCount: number;
  shopId: string;
  shopName: string | null;
};

export type FollowedCast = {
  id: string;
  name: string;
  avatarUrl: string | null;
  shopName: string | null;
  isWorkingToday: boolean;
};

export type FavoriteShop = {
  id: string;
  name: string;
  area: string | null;
  status: string;
};

export type MyComment = {
  id: string;
  body: string;
  createdAt: string;
  reelId: string;
  reelCaption: string | null;
  reelThumbnailUrl: string | null;
};

type Tab = "reels" | "casts" | "shops" | "comments";



export function MypageClient({
  userId,
  initialNickname,
  initialAvatarUrl,
  savedReels,
  followedCasts: initialFollowedCasts,
  favoriteShops: initialFavoriteShops,
  myComments,
}: {
  userId: string;
  initialNickname: string;
  initialAvatarUrl: string | null;
  savedReels: SavedReel[];
  followedCasts: FollowedCast[];
  favoriteShops: FavoriteShop[];
  myComments: MyComment[];
}) {
  const { t } = useLocale();
  const TABS: { key: Tab; label: string }[] = [
    { key: "reels", label: t.mypage.tabReels },
    { key: "casts", label: t.mypage.tabCasts },
    { key: "shops", label: t.mypage.tabShops },
    { key: "comments", label: t.mypage.tabComments },
  ];
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("reels");
  const [nickname, setNickname] = useState(initialNickname);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [comments, setComments] = useState(myComments);
  const [followedCasts, setFollowedCasts] = useState(initialFollowedCasts);
  const [favoriteShops, setFavoriteShops] = useState(initialFavoriteShops);

  const [editOpen, setEditOpen] = useState(false);
  const [editNickname, setEditNickname] = useState(initialNickname);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/mypage/login");
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
    const path = `${userId}/avatar-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("locapass-ugc").upload(path, blob, {
      contentType: "image/jpeg",
    });

    if (uploadError) {
      setAvatarUploading(false);
      setProfileError(`${t.mypage.avatarUploadFailed}: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("locapass-ugc").getPublicUrl(path);
    const newAvatarUrl = publicUrlData.publicUrl;

    const { data, error: updateError } = await supabase
      .from("locapass_members")
      .upsert({ id: userId, nickname, avatar_url: newAvatarUrl }, { onConflict: "id" })
      .select("id")
      .single();

    setAvatarUploading(false);

    if (updateError || !data) {
      setProfileError(`${t.mypage.avatarSaveFailed}: ${updateError?.message ?? t.mypage.unknownError}`);
      return;
    }
    setAvatarUrl(newAvatarUrl);
    router.refresh();
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editNickname.trim()) {
      setProfileError(t.mypage.nicknameRequired);
      return;
    }
    setProfileSaving(true);
    setProfileError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("locapass_members")
      .upsert({ id: userId, nickname: editNickname.trim() }, { onConflict: "id" })
      .select("id")
      .single();

    setProfileSaving(false);
    if (error || !data) {
      setProfileError(`${t.mypage.saveFailed}: ${error?.message ?? t.mypage.unknownError}`);
      return;
    }
    setNickname(editNickname.trim());
    setEditOpen(false);
  }

  async function handleDeleteComment(commentId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("locapass_reel_comments")
      .update({ is_deleted: true })
      .eq("id", commentId)
      .select("id");

    if (error || !data || data.length === 0) return;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  async function handleUnfollowCast(castId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("locapass_cast_follows")
      .delete()
      .eq("user_id", userId)
      .eq("cast_id", castId);
    if (error) return;
    setFollowedCasts((prev) => prev.filter((c) => c.id !== castId));
  }

  async function handleUnfavoriteShop(shopId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("locapass_shop_favorites")
      .delete()
      .eq("member_id", userId)
      .eq("shop_id", shopId);
    if (error) return;
    setFavoriteShops((prev) => prev.filter((s) => s.id !== shopId));
  }

  return (
    <div className="pb-8">
      <header className="flex items-center justify-between px-4 pt-6">
        <div className="w-6" />
        <h1 className="font-display text-xl font-semibold uppercase tracking-[0.3em] text-accent">
          MY PAGE
        </h1>
        <div className="flex items-center gap-3">
          <NotificationBell size={18} />
          <Link href="/inquiries" aria-label={t.mypage.inquiryHistory} className="text-main/80">
            <MessageCircle size={18} />
          </Link>
          <Link href="/mypage/account" aria-label={t.mypage.accountSettings} className="text-main/80">
            <Settings size={18} />
          </Link>
          <button type="button" onClick={handleLogout} aria-label={t.mypage.logout} className="text-main/80">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* プロフィールエリア */}
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
          aria-label={t.mypage.changeAvatar}
          className="relative mx-auto block h-20 w-20 rounded-full disabled:opacity-60"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-20 w-20 rounded-full border border-accent/50 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-accent/50 bg-tone-800 text-2xl font-semibold text-accent">
              {nickname.slice(0, 1)}
            </div>
          )}
          <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-page bg-accent text-on-accent">
            <Camera size={12} />
          </span>
        </button>

        <h2 className="mt-3 text-lg font-bold">{nickname}</h2>

        <button
          type="button"
          onClick={() => {
            setEditNickname(nickname);
            setProfileError(null);
            setEditOpen(true);
          }}
          className="mt-2 rounded-full border border-main/20 px-4 py-1 text-xs text-tone-300 transition hover:border-accent/60 hover:text-accent"
        >
          {t.mypage.editProfile}
        </button>

        <div className="mt-5 flex justify-center gap-8">
          <button type="button" onClick={() => setTab("casts")} className="text-center">
            <p className="text-base font-bold">{followedCasts.length}</p>
            <p className="text-[11px] text-muted">{t.mypage.following}</p>
          </button>
          <button type="button" onClick={() => setTab("shops")} className="text-center">
            <p className="text-base font-bold">{favoriteShops.length}</p>
            <p className="text-[11px] text-muted">{t.mypage.favoriteShops}</p>
          </button>
          <button type="button" onClick={() => setTab("reels")} className="text-center">
            <p className="text-base font-bold">{savedReels.length}</p>
            <p className="text-[11px] text-muted">{t.mypage.savedReels}</p>
          </button>
        </div>
      </section>

      {/* 本日出勤中の推し(丸アイコン、店舗詳細ページの「本日の出勤」と同じ見た目) */}
      {followedCasts.some((c) => c.isWorkingToday) && (
        <section className="border-t border-main/10 px-2 py-3">
          <p className="px-2 text-xs font-semibold text-muted">{t.mypage.workingToday}</p>
          <div className="mt-2 flex items-start gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar px-2">
            {followedCasts
              .filter((c) => c.isWorkingToday)
              .map((c) => (
                <Link
                  key={c.id}
                  href={`/cast/${c.id}`}
                  className="flex min-w-[72px] flex-col items-center gap-1 snap-start group"
                >
                  <div className="rounded-full bg-gradient-to-tr from-yellow-400 via-rose-500 to-purple-600 p-[2px] transition group-hover:scale-105">
                    <div className="rounded-full bg-page p-[2px]">
                      {c.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tone-800 text-tone-500">
                          {c.name.slice(0, 1)}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="max-w-[68px] truncate text-center text-xs text-tone-300 group-hover:text-main">
                    {c.name}
                  </span>
                </Link>
              ))}
          </div>
        </section>
      )}

      {/* タブ */}
      <nav className="mt-6 flex border-b border-main/10 px-2">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            onClick={() => setTab(tabItem.key)}
            className={`flex-1 px-1 py-3 text-[11px] font-medium transition ${
              tab === tabItem.key ? "border-b-2 border-accent text-accent" : "text-tone-500"
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </nav>

      <section className="px-4 py-5">
        {tab === "reels" && (
          savedReels.length === 0 ? (
            <EmptyState text={t.mypage.noSavedReels} />
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {savedReels.map((r) => (
                // タップでその店舗のリールフィードを開き、?startでこの動画から再生させる
                // (グリッド内のvideoはサムネイル表示専用で再生しない)。
                <Link
                  key={r.id}
                  href={`/shops/${r.shopId}/reels?start=${r.id}`}
                  className="relative block aspect-[9/16] overflow-hidden rounded bg-surface"
                >
                  {r.media[0]?.type === "video" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <StreamVideo
                      src={r.media[0].url}
                      active={false}
                      poster={
                        r.media[0].poster ??
                        (r.media[0].url.includes(".m3u8")
                          ? streamThumbnailFromManifestUrl(r.media[0].url)
                          : undefined)
                      }
                      preload="metadata"
                      className="h-full w-full object-cover"
                      muted
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.media[0]?.url} alt="" className="h-full w-full object-cover" />
                  )}
                  {r.media[0]?.type === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Play size={22} className="fill-main/80 text-main/80 drop-shadow" />
                    </span>
                  )}
                  {r.shopName && (
                    <span data-surface="media" className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-main">
                      {r.shopName}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )
        )}

        {tab === "casts" && (
          followedCasts.length === 0 ? (
            <EmptyState text={t.mypage.noFollowedCasts} />
          ) : (
            <ul className="space-y-3">
              {followedCasts.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Link
                    href={`/cast/${c.id}`}
                    className="flex flex-1 items-center gap-3 rounded-lg border border-main/10 bg-main/[0.03] p-3"
                  >
                    {c.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tone-800 text-tone-500">
                        {c.name.slice(0, 1)}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.shopName && <p className="text-xs text-muted">{c.shopName}</p>}
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                        c.isWorkingToday ? "bg-brand/20 text-brand" : "bg-main/10 text-muted"
                      }`}
                    >
                      {c.isWorkingToday ? t.mypage.workingTodayBadge : t.mypage.offTodayBadge}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleUnfollowCast(c.id)}
                    aria-label={t.mypage.unfollow}
                    className="shrink-0 rounded-full border border-main/20 p-2 text-muted transition hover:border-red-400/60 hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === "shops" && (
          favoriteShops.length === 0 ? (
            <EmptyState text={t.mypage.noFavoriteShops} />
          ) : (
            <ul className="space-y-3">
              {favoriteShops.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <Link
                    href={`/shops/${s.id}`}
                    className="block flex-1 rounded-lg border border-main/10 bg-main/[0.03] p-3"
                  >
                    <p className="text-sm font-medium">{s.name}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {s.area && <span>{s.area}</span>}
                      <span className={s.status === "active" ? "text-emerald-400" : "text-tone-500"}>
                        {s.status === "active" ? t.mypage.open : t.mypage.closed}
                      </span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleUnfavoriteShop(s.id)}
                    aria-label={t.mypage.unfavorite}
                    className="shrink-0 rounded-full border border-main/20 p-2 text-muted transition hover:border-red-400/60 hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === "comments" && (
          comments.length === 0 ? (
            <EmptyState text={t.mypage.noComments} />
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-3 rounded-lg border border-main/10 bg-main/[0.03] p-3">
                  <div className="h-12 w-9 flex-shrink-0 overflow-hidden rounded bg-surface">
                    {c.reelThumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.reelThumbnailUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-tone-200">{c.body}</p>
                    <p className="mt-1 text-[11px] text-tone-500">
                      {new Date(c.createdAt).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(c.id)}
                    aria-label={t.mypage.deleteComment}
                    className="self-start text-tone-500 transition hover:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      <div className="px-4 pt-8">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-main/20 py-3 text-sm font-medium text-tone-300 transition hover:border-red-400/60 hover:text-red-400"
        >
          <LogOut size={16} />
          {t.mypage.logout}
        </button>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center">
          <form
            onSubmit={handleSaveProfile}
            className="w-full max-w-sm rounded-t-2xl border border-main/10 bg-surface p-5 md:rounded-2xl"
          >
            <h3 className="text-sm font-bold text-accent">{t.mypage.editProfileTitle}</h3>
            <label className="mt-4 block text-xs text-muted">{t.mypage.nicknameLabel}</label>
            <input
              type="text"
              value={editNickname}
              onChange={(e) => setEditNickname(e.target.value)}
              className="mt-1 w-full rounded-lg border border-main/20 bg-main/5 px-3 py-2 text-[16px] text-main"
            />
            {profileError && <p className="mt-2 text-xs text-red-400">{profileError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex-1 rounded-full border border-main/20 py-2 text-sm text-tone-300"
              >
                {t.mypage.cancel}
              </button>
              <button
                type="submit"
                disabled={profileSaving}
                className="flex-1 rounded-full bg-gradient-to-r from-cta-gold-dark via-cta-gold to-cta-gold-light py-2 text-sm font-semibold text-on-cta-gold disabled:opacity-60"
              >
                {profileSaving ? t.mypage.saving : t.mypage.save}
              </button>
            </div>
          </form>
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

function EmptyState({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-tone-500">{text}</p>;
}
