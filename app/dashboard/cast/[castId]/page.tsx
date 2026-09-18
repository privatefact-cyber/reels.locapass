import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";
import { InviteCastButton } from "@/components/InviteCastButton";
import { CastPhotoUploader } from "@/components/CastPhotoUploader";
import { CastLoginLinkCard } from "@/components/dashboard/CastLoginLinkCard";
import { CastIdentityFields } from "@/components/dashboard/CastIdentityFields";
import { CastIdDocumentUploader } from "@/components/dashboard/CastIdDocumentUploader";
import { CastReelPostForm } from "@/components/dashboard/CastReelPostForm";
import { CastReelCaptionCell } from "@/components/dashboard/CastReelCaptionCell";
import { TimeSelect } from "@/components/dashboard/TimeSelect";
import {
  addSchedule,
  deleteCastReel,
  deleteCastReelComment,
  deletePhoto,
  deleteSchedule,
  regenerateCastLoginToken,
  updateCastProfile,
} from "../actions";

export default async function CastEditPage({
  params,
}: {
  params: Promise<{ castId: string }>;
}) {
  const { castId } = await params;
  const shop = await requireCurrentShop();
  if (!shop) {
    return (
      <p className="text-sm text-red-600">
        所属店舗が見つかりません。運営者にお問い合わせください。
      </p>
    );
  }

  const supabase = await createClient();

  const { data: cast } = await supabase
    .from("cast_members")
    .select(
      "id, name, age, pr_text, sizes, shop_id, user_id, legal_name, legal_name_kana, birth_date, phone, address, id_check_match_level, id_check_hit_count, id_checked_at, id_document_path",
    )
    .eq("id", castId)
    .eq("shop_id", shop.id)
    .single();

  if (!cast) {
    notFound();
  }

  const [{ data: media }, { data: schedules }, { data: castReels }, { data: loginToken }, { data: reelComments }] =
    await Promise.all([
      supabase
        .from("media")
        .select("id, url, display_order")
        .eq("cast_id", castId)
        .order("display_order", { ascending: true }),
      supabase
        .from("schedules")
        .select("id, date, start_time, end_time, is_working_today")
        .eq("cast_id", castId)
        .order("date", { ascending: false })
        .limit(14),
      supabase
        .from("reels")
        .select("id, caption, media, likes_count, created_at")
        .eq("cast_id", castId)
        .order("created_at", { ascending: false }),
      supabase.from("cast_login_tokens").select("token").eq("cast_id", castId).single(),
      supabase
        .from("reel_comments")
        .select("id, body, author_type, parent_comment_id, created_at, reels!inner(cast_id)")
        .eq("reels.cast_id", castId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;
  const loginUrl = loginToken ? `${origin}/cast/link/${loginToken.token}` : null;
  const boundRegenerateLoginToken = regenerateCastLoginToken.bind(null, castId);

  const sizes = (cast.sizes as { t?: string; b?: string; w?: string; h?: string } | null) ?? {};

  const idDocumentSignedUrl = cast.id_document_path
    ? (
        await supabase.storage
          .from("id-documents")
          .createSignedUrl(cast.id_document_path, 300)
      ).data?.signedUrl ?? null
    : null;

  const boundUpdateProfile = updateCastProfile.bind(null, castId);
  const boundAddSchedule = addSchedule.bind(null, castId);

  const commentTopLevels = (reelComments ?? []).filter((c) => c.author_type === "customer");
  const commentRepliesByParent = new Map(
    (reelComments ?? [])
      .filter((c) => c.author_type === "cast" && c.parent_comment_id)
      .map((c) => [c.parent_comment_id, c]),
  );

  return (
    <div className="space-y-8">
      <p className="text-xs text-slate-500">{shop.name}</p>
      <h1 className="text-3xl font-bold text-slate-900">{cast.name} の管理</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">プロフィール</h2>
        <form action={boundUpdateProfile} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="name"
            defaultValue={cast.name}
            required
            placeholder="氏名"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <input
            name="age"
            type="number"
            defaultValue={cast.age ?? ""}
            placeholder="年齢"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <input
            name="t"
            defaultValue={sizes.t ?? ""}
            placeholder="T"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <input
            name="b"
            defaultValue={sizes.b ?? ""}
            placeholder="B"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <input
            name="w"
            defaultValue={sizes.w ?? ""}
            placeholder="W"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <input
            name="h"
            defaultValue={sizes.h ?? ""}
            placeholder="H"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <textarea
            name="pr_text"
            defaultValue={cast.pr_text ?? ""}
            placeholder="PR文"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-black sm:col-span-4"
            rows={3}
          />

          <div className="sm:col-span-4">
            <CastIdentityFields
              defaultLegalName={cast.legal_name ?? ""}
              defaultLegalNameKana={cast.legal_name_kana ?? ""}
              defaultBirthDate={cast.birth_date ?? ""}
              defaultAddress={cast.address ?? ""}
              defaultPhone={cast.phone ?? ""}
            />
            {cast.id_checked_at && (
              <p
                className={`mt-2 text-xs font-semibold ${
                  cast.id_check_match_level === "flagged"
                    ? "text-red-600"
                    : cast.id_check_match_level === "caution"
                      ? "text-amber-600"
                      : "text-slate-500"
                }`}
              >
                与信照会結果: {cast.id_check_match_level === "flagged"
                  ? `要注意(${cast.id_check_hit_count}件一致)`
                  : cast.id_check_match_level === "caution"
                    ? "軽度の一致あり"
                    : "問題なし"}
                {" "}({new Date(cast.id_checked_at).toLocaleString("ja-JP")})
              </p>
            )}
          </div>

          <button
            type="submit"
            className="sm:col-span-4 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            プロフィールを更新
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">身分証画像(本人確認書類)</h2>
        <p className="mb-3 text-xs text-slate-500">
          店舗スタッフのみ閲覧できます。表示用リンクは5分で失効します。
        </p>
        {idDocumentSignedUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={idDocumentSignedUrl}
            alt="身分証画像"
            className="mb-3 max-h-64 rounded-lg border border-slate-200 object-contain"
          />
        )}
        <CastIdDocumentUploader castId={castId} hasDocument={!!cast.id_document_path} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">リール投稿用ログイン</h2>
        <p className="mb-3 text-xs text-slate-500">
          発行すると、キャスト本人がリール(縦型動画/写真)を自分のスマホから直接投稿できるようになります。
          {cast.user_id && " 既にログインは発行済みです。"}
        </p>
        <InviteCastButton castId={castId} hasLogin={!!cast.user_id} />
      </section>

      {cast.user_id && loginUrl && (
        <CastLoginLinkCard
          castName={cast.name}
          loginUrl={loginUrl}
          regenerateAction={boundRegenerateLoginToken}
        />
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">写真</h2>
        <div className="mb-3 flex flex-wrap gap-3">
          {media?.map((m) => (
            <div key={m.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt="" className="h-32 w-24 rounded object-cover" />
              <form action={deletePhoto.bind(null, castId, m.id)}>
                <button
                  type="submit"
                  className="mt-1 w-full rounded bg-slate-50 px-1 py-0.5 text-xs text-slate-600 hover:bg-red-100 hover:text-red-700"
                >
                  削除
                </button>
              </form>
            </div>
          ))}
        </div>
        <CastPhotoUploader castId={castId} shopId={shop.id} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">出勤スケジュール</h2>
        <form action={boundAddSchedule} className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <input
            name="date"
            type="date"
            required
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <TimeSelect
            name="start_time"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <TimeSelect
            name="end_time"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <label className="flex items-center gap-2 text-sm">
            <input name="is_working_today" type="checkbox" defaultChecked />
            出勤する
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            登録
          </button>
        </form>
        {schedules && schedules.length > 0 ? (
          <ul className="divide-y divide-black/10">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {s.date}{" "}
                  {s.is_working_today
                    ? `${s.start_time ?? "--:--"} 〜 ${s.end_time ?? "--:--"}`
                    : "お休み"}
                </span>
                <form action={deleteSchedule.bind(null, castId, s.id)}>
                  <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                    削除
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">出勤予定の登録はまだありません。</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">キャストリール</h2>
        <p className="mb-3 text-xs text-slate-500">
          ここから投稿するとキャスト本人のリールとしてタグ付けされます(店舗リールは
          「リール投稿」ページから)。
        </p>
        <div className="mb-4">
          <CastReelPostForm castId={castId} shopId={shop.id} />
        </div>
        {castReels && castReels.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {castReels.map((r) => {
              const media = (r.media as { type: string; url: string }[])[0];
              return (
                <div
                  key={r.id}
                  className="relative aspect-[9/16] overflow-hidden rounded-lg border border-slate-200 bg-slate-950"
                >
                  {media?.type === "video" ? (
                    <video
                      src={`${media.url}#t=0.001`}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media?.url} alt="" className="h-full w-full object-cover" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2">
                    {r.caption && <CastReelCaptionCell caption={r.caption} />}
                    <p className="text-[10px] text-white/70">♥ {r.likes_count}</p>
                  </div>
                  <form action={deleteCastReel.bind(null, castId, r.id)} className="absolute right-1 top-1">
                    <button
                      type="submit"
                      className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-600"
                    >
                      削除
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">まだキャストリールの投稿はありません。</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">ついたコメント</h2>
        <p className="mb-3 text-xs text-slate-500">
          悪質なコメントはここから削除できます(削除すると投稿者以外には表示されなくなります)。
        </p>
        {commentTopLevels.length > 0 ? (
          <ul className="space-y-2 divide-y divide-black/10">
            {commentTopLevels.map((c) => {
              const reply = commentRepliesByParent.get(c.id);
              return (
                <li key={c.id} className="pt-2 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-900">{c.body}</p>
                    <form action={deleteCastReelComment.bind(null, castId, c.id)}>
                      <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                        削除
                      </button>
                    </form>
                  </div>
                  {reply && (
                    <div className="mt-1 flex items-center justify-between gap-2 pl-3">
                      <p className="text-xs text-slate-500">キャストより: {reply.body}</p>
                      <form action={deleteCastReelComment.bind(null, castId, reply.id)}>
                        <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                          削除
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">まだコメントはありません。</p>
        )}
      </section>
    </div>
  );
}
