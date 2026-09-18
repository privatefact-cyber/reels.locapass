"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 縦スクロールのリール一覧から「今いちばん画面に映っているカードのindex」を
 * IntersectionObserver 1本だけで追跡するフック。
 *
 * カードごとに個別のIntersectionObserverを持たせると、
 * 「画面内に複数本が同時再生される」「先読み対象が把握できない」といった
 * 事故につながるため、親コンポーネント側でindexを一元管理する設計にしている。
 */
export function useActiveReelIndex(itemCount: number) {
  const [activeIndex, setActiveIndex] = useState(0);
  const elementToIndex = useRef(new WeakMap<Element, number>());
  // マウント直後はrefコールバック(コミット時に同期実行)の方が
  // observerを作るuseEffect(コミット後に非同期実行)より先に走るため、
  // 最初にマウントされた要素はobserver生成時点でまだ登録先が無い。
  // そのため要素はここに一旦控えておき、observer生成後にまとめて観測する。
  const pendingElements = useRef(new Set<Element>());
  const visibilityRatios = useRef(new Map<number, number>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    visibilityRatios.current.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = elementToIndex.current.get(entry.target);
          if (index === undefined) continue;
          visibilityRatios.current.set(index, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let bestIndex = -1;
        let bestRatio = 0;
        visibilityRatios.current.forEach((ratio, index) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIndex = index;
          }
        });

        if (bestIndex !== -1) {
          setActiveIndex(bestIndex);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] },
    );

    observerRef.current = observer;
    pendingElements.current.forEach((el) => observer.observe(el));
    pendingElements.current.clear();

    return () => {
      observer.disconnect();
      if (observerRef.current === observer) {
        observerRef.current = null;
      }
    };
    // observerを要素数(itemCount)が変わるたびに作り直すと、直後の再レンダーで
    // refコールバックが「作り直す前の古いobserver」に対して要素を再登録してしまい
    // (ref実行 → useEffect実行の順であるため)、新しいobserverには
    // 何も要素が登録されないまま古いobserverがdisconnectされる。
    // これによりカードを継ぎ足すたび(2周目以降)に無限スクロールの追跡が止まっていた。
    // observerはマウント時に1つだけ作り、以後の要素追加はregisterItem経由で
    // 同じobserverインスタンスに観測させ続ける。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerItem = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (!el) return;
      elementToIndex.current.set(el, index);
      if (observerRef.current) {
        observerRef.current.observe(el);
      } else {
        pendingElements.current.add(el);
      }
    },
    [],
  );

  return { activeIndex, registerItem };
}
