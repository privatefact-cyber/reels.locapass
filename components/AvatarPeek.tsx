"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

// closeModal()でフェードアウト(opacity/transform)を開始してから、実際にDOMから
// 完全にunmountするまでの猶予(トランジション用CSSのduration-200より長く取る)。
const UNMOUNT_DELAY_MS = 600;

// PCのマウスホバー時に出す小さいプレビュー(アイコンの真上に浮かせる)。
const HOVER_PEEK_IFRAME_WIDTH = 375;
const HOVER_PEEK_IFRAME_HEIGHT = 812;
const HOVER_PEEK_WIDTH = 200;
const HOVER_PEEK_SCALE = HOVER_PEEK_WIDTH / HOVER_PEEK_IFRAME_WIDTH;
const HOVER_PEEK_HEIGHT = Math.round(HOVER_PEEK_IFRAME_HEIGHT * HOVER_PEEK_SCALE);

/**
 * プロフィールアイコンのプレビュー。押している時間(タイマー)では判定しない
 * — スマホでは指を置いた長さがネイティブの「画像を保存」長押しメニューと競合し、
 * 挙動が不安定になるため。代わりに「タップ回数」だけで判定する:
 *   1回目のタップ(アイコン): プレビューを表示するだけ(遷移しない)
 *   プレビュー内の「このページを開く」をタップ: 本ページへ遷移
 *   プレビューの外側(背景)をタップ: 閉じるだけ
 * これは指を置く長さに一切依存しないので安定して動き、通常のクリックしか使わないため
 * ネイティブの長押しメニューもそもそも発生しない。
 *
 * PC(マウスでホバーできる環境)では、それとは別にホバーするだけで
 * アイコンの近くに小さいプレビューを表示し、カーソルを外せば閉じる。
 */
export function AvatarPeek({
  href,
  label,
  className,
  children,
  prefetch = false,
}: {
  href: string;
  label: string;
  className?: string;
  children: React.ReactNode;
  /**
   * trueの間、タップされる前からモーダルのiframeを裏で先読みしておく
   * (親のReelCardが isActive のときだけ渡す想定。全カード分を先読みすると
   * 逆に重くなるため、今まさに見ているカードだけを対象にする)。
   */
  prefetch?: boolean;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const pathname = usePathname();
  const [peeking, setPeeking] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 一度でも開かれたら(またはprefetch対象になったら)iframeのsrcをセットし、
  // 以後はpeeking/prefetchがfalseに戻ってもDOMからは外さない
  // (タップのたびにマウント/アンマウントし直さないことで、開閉をtransform/opacityだけの
  // 軽量な切り替えにする)。
  const [primed, setPrimed] = useState(prefetch);
  const unmountTimerRef = useRef<number | null>(null);

  function clearUnmountTimer() {
    if (unmountTimerRef.current != null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  }

  // モーダルを閉じる。画面遷移(router.push)の完了は一切待たず、呼ばれた瞬間に
  // フェードアウト(opacity/transform、pointer-events:noneも即時)を開始し、
  // 600ms後にDOMから完全にunmountする(iframe・画像・プロフィール情報も含めて解放)。
  function closeModal() {
    setPeeking(false);
    clearUnmountTimer();
    unmountTimerRef.current = window.setTimeout(() => {
      setPrimed(false);
      unmountTimerRef.current = null;
    }, UNMOUNT_DELAY_MS);
  }

  useEffect(() => {
    if (prefetch) {
      setPrimed(true);
    } else if (!peeking) {
      // 表示中のカードでなくなり、モーダルも開いていなければ先読み用iframeは解放する
      // (スクロールした先々のカード全部を溜め込んで重くならないようにするため)。
      setPrimed(false);
    }
  }, [prefetch, peeking]);

  // 保険: ルート(pathname)が実際に変わったら、閉じ忘れが残らないよう強制的に閉じる。
  // (マウント時の初回発火では閉じない。先読み中のprefetchまで巻き込んで
  // 消してしまわないようにするため。)
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      closeModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // アンマウント時にタイマーを必ず片付ける。
  useEffect(() => clearUnmountTimer, []);

  function handleClick() {
    // loadedは既存(先読み済み)のiframeがそのまま使い回されるかどうかで決まるため、
    // ここではリセットしない(既に読み込み終わっているのにスピナーが再度出てしまうため)。
    clearUnmountTimer();
    setPrimed(true);
    setPeeking(true);
  }

  function handleOpenPage() {
    // router.push()の完了を待たず、タップした瞬間に独立してモーダルの終了処理を開始する。
    closeModal();
    router.push(href);
  }

  function handleMouseEnter() {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      setHovering(true);
    }
  }

  function handleMouseLeave() {
    setHovering(false);
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={label}
        className={className}
        // スマホでアイコンを長押しした場合に備え、iOS/Androidネイティブの「画像を保存」
        // メニューは念のため無効化しておく(通常はタップだけで完結するので出ないはずだが)。
        style={{
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
          touchAction: "manipulation",
        }}
        draggable={false}
      >
        {children}
      </button>

      {hovering && (
        <div data-surface="media" className="pointer-events-none absolute bottom-full right-0 z-[60] mb-2 overflow-hidden rounded-2xl border border-main/20 bg-black shadow-2xl">
          <div
            className="relative overflow-hidden bg-tone-950"
            style={{ width: HOVER_PEEK_WIDTH, height: HOVER_PEEK_HEIGHT }}
          >
            <iframe
              src={href}
              title={label}
              tabIndex={-1}
              scrolling="no"
              className="absolute left-0 top-0 origin-top-left border-0"
              style={{
                width: HOVER_PEEK_IFRAME_WIDTH,
                height: HOVER_PEEK_IFRAME_HEIGHT,
                transform: `scale(${HOVER_PEEK_SCALE})`,
              }}
            />
          </div>
        </div>
      )}

      {primed && (
        // タップのたびにマウント/アンマウントし直さず、開閉はtransform/opacityだけで
        // 切り替える(GPU合成のみで済み、DOM再生成やiframeの再読み込みが発生しない)。
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm transition-opacity duration-200 will-change-[opacity] ${
            peeking ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={closeModal}
        >
          <div data-surface="media"
            className={`relative h-[60vh] w-[74vw] max-w-sm transform-gpu overflow-hidden rounded-3xl border border-main/20 bg-black shadow-2xl transition-transform duration-200 will-change-transform md:h-[75vh] md:w-[92vw] ${
              peeking ? "scale-100" : "scale-95"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 読み込みが終わるまでは真っ黒のまま止まって見えないよう、スピナーを重ねておく。 */}
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="animate-spin text-main/60" size={28} />
              </div>
            )}
            <iframe
              src={href}
              title={label}
              onLoad={() => setLoaded(true)}
              className="pointer-events-none h-full w-full"
            />
          </div>
          <button
            type="button"
            onClick={handleOpenPage}
            className="pointer-events-auto rounded-full border border-main/30 bg-main/10 px-4 py-2 text-xs text-main"
          >
            {t.common.openThisPage}
          </button>
        </div>
      )}
    </span>
  );
}
