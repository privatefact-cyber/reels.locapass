"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Calendar, Film, MessageSquare, Megaphone, Trash2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

import { useLocale } from "@/components/i18n/LocaleProvider";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

const ICONS: Record<string, typeof Bell> = {
  new_cast: UserPlus,
  new_event: Calendar,
  new_shop_reel: Film,
  new_cast_reel: Film,
  shop_message: MessageSquare,
  admin_message: Megaphone,
};

const TABLE = "locapass_notifications";
/** 左スワイプでゴミ箱ボタンが現れる幅(px)。 */
const REVEAL_WIDTH = 76;

/**
 * 通知1件分の行。
 * - スマホ: 左にスワイプするとゴミ箱ボタンが現れ、タップで削除(Instagram/LINEと同じ操作)。
 * - PC: マウスを乗せると右端にゴミ箱ボタンが出る。
 */
function NotificationRow({
  n,
  Icon,
  isOpen,
  onOpen,
  onClose,
  onDelete,
  deleteLabel,
}: {
  n: Notification;
  Icon: typeof Bell;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
  deleteLabel: string;
}) {
  const [dragX, setDragX] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const moved = useRef(false);

  const baseX = isOpen ? -REVEAL_WIDTH : 0;
  const x = dragX ?? baseX;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, base: baseX };
    axis.current = null;
    moved.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (!axis.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    // 縦スクロールの意図なら何もしない(一覧のスクロールを邪魔しない)。
    if (axis.current !== "x") return;
    moved.current = true;
    setDragX(Math.max(-REVEAL_WIDTH * 1.4, Math.min(0, start.current.base + dx)));
  }

  function onTouchEnd() {
    if (dragX !== null) {
      if (dragX < -REVEAL_WIDTH / 2) onOpen();
      else onClose();
    }
    setDragX(null);
    start.current = null;
  }

  const Row = (
    <div
      className={`flex items-start gap-3 rounded-xl px-3 py-3 transition ${
        n.read_at ? "bg-transparent" : "bg-white/5"
      }`}
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-gold">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-100">{n.title}</p>
        {n.body && <p className="mt-0.5 truncate text-xs text-neutral-400">{n.body}</p>}
        <p className="mt-1 text-[11px] text-neutral-500">{new Date(n.created_at).toLocaleString("ja-JP")}</p>
      </div>
    </div>
  );

  return (
    <li className="group relative overflow-hidden rounded-xl">
      {/* スワイプで現れるゴミ箱(背面)。開いていない間はタップ・読み上げの対象にしない。 */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={deleteLabel}
        tabIndex={isOpen ? 0 : -1}
        aria-hidden={!isOpen}
        style={{ width: REVEAL_WIDTH }}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 bg-red-600 text-white"
      >
        <Trash2 size={18} />
        <span className="text-[10px] font-semibold">{deleteLabel}</span>
      </button>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: `translateX(${x}px)`,
          transition: dragX === null ? "transform 200ms ease-out" : "none",
        }}
        className="relative bg-neutral-950"
        // スワイプ直後の指離しで、リンクが開いてしまわないようにする。
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          } else if (isOpen) {
            // 開いている行をタップしたら、遷移せずに閉じる。
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {n.url ? (
          <Link href={n.url} className="block">
            {Row}
          </Link>
        ) : (
          Row
        )}

        {/* PC: マウスを乗せると右端にゴミ箱ボタンを出す(スワイプできないため)。 */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          aria-label={deleteLabel}
          title={deleteLabel}
          className="absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-full bg-black/60 text-neutral-300 opacity-0 transition hover:bg-red-600 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 md:flex"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </li>
  );
}

export function NotificationsList() {
  const { t } = useLocale();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid || cancelled) return;

      const { data: rows } = await supabase
        .from(TABLE)
        .select("id, type, title, body, url, read_at, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);

      if (cancelled) return;
      setNotifications(rows ?? []);

      // 開いたら未読を既読にする(Instagramの通知欄と同じ挙動)。
      await supabase.from(TABLE).update({ read_at: new Date().toISOString() }).eq("user_id", uid).is("read_at", null);
      // ヘッダーのベルバッジは初回マウント時に件数を取得したきり更新されないため、
      // 既読化したことをイベントで知らせて即座に消す。
      window.dispatchEvent(new Event("luxela:notifications-read"));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 削除は「画面から先に消す → DBで消す → 消えていなければ元に戻す」。
  // RLSで対象0件になってもエラーにならないので、消えた行数を必ず確認する。
  async function deleteNotifications(ids: string[]) {
    if (!notifications || ids.length === 0) return;
    const before = notifications;
    setError(null);
    setOpenId(null);
    setNotifications(before.filter((n) => !ids.includes(n.id)));

    const supabase = createClient();
    const { data, error: delError } = await supabase.from(TABLE).delete().in("id", ids).select("id");
    if (delError || !data || data.length !== ids.length) {
      setNotifications(before);
      setError(t.notifications.deleteFailed);
    }
  }

  if (notifications === null) return null;

  if (notifications.length === 0) {
    return <p className="mt-10 text-center text-sm text-neutral-500">{t.notifications.empty}</p>;
  }

  return (
    <div>
      <div className="mt-2 flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t.notifications.deleteAllConfirm)) {
              void deleteNotifications(notifications.map((n) => n.id));
            }
          }}
          className="rounded-full px-3 py-1 text-xs text-neutral-400 transition hover:bg-white/10 hover:text-red-400"
        >
          {t.notifications.deleteAll}
        </button>
      </div>
      {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
      <ul className="mt-2 space-y-1">
        {notifications.map((n) => (
          <NotificationRow
            key={n.id}
            n={n}
            Icon={ICONS[n.type] ?? Bell}
            isOpen={openId === n.id}
            onOpen={() => setOpenId(n.id)}
            onClose={() => setOpenId((cur) => (cur === n.id ? null : cur))}
            onDelete={() => void deleteNotifications([n.id])}
            deleteLabel={t.notifications.delete}
          />
        ))}
      </ul>
    </div>
  );
}
