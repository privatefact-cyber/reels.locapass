"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/locale";

/**
 * 管理画面(店舗オーナー向け)の文言を、表示言語に合わせて差し替える。
 * 画面の文言は日本語で書かれていて、lib/dashboard-i18n/catalog.json(scripts/translate-dashboard-ui.ts が作る)に
 * 「日本語 → 英・中・アラビア語」の対応がある。ここでは、画面に出た文字(と placeholder/title/aria-label/alt)を
 * カタログで引いて、見つかったものだけ差し替える。見つからないもの(店名などの入力内容、未翻訳の文言)は、そのまま。
 *
 * - 表示のあとで差し替えると日本語がちらつくので、日本語以外では最初の差し替えが済むまで隠す(layoutEffect)。
 * - Reactが文字を書き換えたとき・要素が増えたときも、MutationObserverで追いかけて差し替える。
 * - 元の日本語は覚えておき、言語を切り替えたとき(日本語に戻すときも)元から訳し直す。
 * - alert / confirm / prompt の文言も訳す。
 */

type Catalog = Record<string, string>;
type Rec = { src: string; out: string };

const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT", "CODE", "PRE"]);

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** カタログから、文言を引く関数を作る。"{0}" を含むキーは、数字や名前が入る文として引く。 */
function createTranslator(catalog: Catalog): (text: string) => string {
  const patterns: { re: RegExp; out: string; weight: number }[] = [];
  for (const [key, value] of Object.entries(catalog)) {
    if (!/\{\d+\}/.test(key)) continue;
    const parts = key.split(/\{\d+\}/);
    const re = new RegExp("^" + parts.map(escapeRegExp).join("([\\s\\S]+?)") + "$");
    patterns.push({ re, out: value, weight: parts.join("").length });
  }
  patterns.sort((a, b) => b.weight - a.weight);
  const cache = new Map<string, string>();

  const lookup = (core: string): string | null => {
    const exact = catalog[core];
    if (exact) return exact;
    for (const p of patterns) {
      const m = p.re.exec(core);
      if (m) return p.out.replace(/\{(\d+)\}/g, (_, i: string) => m[Number(i) + 1] ?? "");
    }
    return null;
  };

  return (text: string) => {
    const hit = cache.get(text);
    if (hit !== undefined) return hit;
    const core = text.trim();
    let out = text;
    if (core) {
      const found = lookup(core) ?? lookup(core.replace(/\s+/g, " "));
      if (found) out = text.slice(0, text.indexOf(core)) + found + text.slice(text.indexOf(core) + core.length);
    }
    if (cache.size < 5000) cache.set(text, out);
    return out;
  };
}

/**
 * 差し替えない場所。サイト全体(<html>)は、ブラウザの自動翻訳を断るために translate="no" が付いているので、
 * この入れ物の内側にある translate="no" や data-no-translate だけを「ここは訳さない」の目印として扱う。
 */
function shouldSkip(el: Element | null, boundary: Element | null): boolean {
  for (let n: Element | null = el; n && n !== boundary?.parentElement; n = n.parentElement) {
    if (SKIP_TAGS.has(n.tagName) || n.getAttribute("translate") === "no" || n.hasAttribute("data-no-translate") || (n as HTMLElement).isContentEditable) return true;
  }
  return false;
}

export function DashboardTranslator({ locale, catalog, children }: { locale: Locale; catalog: Catalog; children: ReactNode }) {
  const active = locale !== "ja" && Object.keys(catalog).length > 0;
  const [ready, setReady] = useState(!active);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  useIsoLayoutEffect(() => {
    if (!root || !active) {
      setReady(true);
      return;
    }
    const translate = createTranslator(catalog);
    const textRecs = new WeakMap<Text, Rec>();
    const attrRecs = new WeakMap<Element, Partial<Record<(typeof ATTRS)[number], Rec>>>();
    const touchedTexts = new Set<WeakRef<Text>>();
    const touchedEls = new Set<WeakRef<Element>>();

    const doText = (node: Text) => {
      if (shouldSkip(node.parentElement, root)) return;
      const cur = node.nodeValue ?? "";
      const rec = textRecs.get(node);
      const src = rec && cur === rec.out ? rec.src : cur;
      let out = translate(src);
      // 「{n}件」のように数字と単位が別の文字になっている所は、英語・アラビア語では単語の前に空白が要る(「4items」を防ぐ)。
      let prev = node.previousSibling;
      while (prev?.nodeType === Node.COMMENT_NODE) prev = prev.previousSibling; // サーバー描画は、隣り合う文字の間にコメントを挟む
      if (out !== src && prev?.nodeType === Node.TEXT_NODE && /[0-9]$/.test(prev.nodeValue ?? "") && /^[A-Za-z\u0600-\u06FF]/.test(out)) out = ` ${out}`;
      if (out === cur && !rec) return;
      if (out !== cur) node.nodeValue = out;
      if (!rec) touchedTexts.add(new WeakRef(node));
      textRecs.set(node, { src, out });
    };

    const doAttrs = (el: Element) => {
      if (shouldSkip(el, root)) return;
      let recs = attrRecs.get(el);
      for (const attr of ATTRS) {
        const cur = el.getAttribute(attr);
        if (cur === null) continue;
        const rec = recs?.[attr];
        const src = rec && cur === rec.out ? rec.src : cur;
        const out = translate(src);
        if (out === cur && !rec) continue;
        if (out !== cur) el.setAttribute(attr, out);
        if (!recs) {
          recs = {};
          attrRecs.set(el, recs);
          touchedEls.add(new WeakRef(el));
        }
        recs[attr] = { src, out };
      }
    };

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) return doText(node as Text);
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName)) return;
      doAttrs(el);
      for (let c = el.firstChild; c; c = c.nextSibling) walk(c);
    };

    walk(root);
    setReady(true);

    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") doText(r.target as Text);
        else if (r.type === "attributes") doAttrs(r.target as Element);
        else r.addedNodes.forEach(walk);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });

    // alert / confirm / prompt の文言も訳す。
    const w = window;
    const origAlert = w.alert;
    const origConfirm = w.confirm;
    const origPrompt = w.prompt;
    w.alert = (message?: unknown) => origAlert.call(w, typeof message === "string" ? translate(message) : message);
    w.confirm = (message?: string) => origConfirm.call(w, typeof message === "string" ? translate(message) : message);
    w.prompt = (message?: string, def?: string) => origPrompt.call(w, typeof message === "string" ? translate(message) : message, def);

    return () => {
      observer.disconnect();
      w.alert = origAlert;
      w.confirm = origConfirm;
      w.prompt = origPrompt;
      // 言語を切り替える・日本語に戻すときのため、差し替えたものを日本語に戻す(新しい言語で元から訳し直す)。
      for (const ref of touchedTexts) {
        const node = ref.deref();
        const rec = node && textRecs.get(node);
        if (node && rec && node.nodeValue === rec.out) node.nodeValue = rec.src;
      }
      for (const ref of touchedEls) {
        const el = ref.deref();
        const recs = el && attrRecs.get(el);
        if (!el || !recs) continue;
        for (const attr of ATTRS) {
          const rec = recs[attr];
          if (rec && el.getAttribute(attr) === rec.out) el.setAttribute(attr, rec.src);
        }
      }
    };
  }, [root, active, catalog]);

  // display: contents なので、レイアウトには影響しない(隠すためだけの入れ物)。
  return (
    <div ref={setRoot} className="contents" style={ready ? undefined : { visibility: "hidden" }}>
      {children}
    </div>
  );
}
