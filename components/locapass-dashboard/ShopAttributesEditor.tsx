"use client";

import { useState, useTransition } from "react";
import { setShopAttribute } from "@/app/dashboard/shop/[shopId]/actions";
import { ATTRIBUTES, attributeDetailSummary, type AttributeDetail, type AttributeField, type AttributeKey } from "@/lib/verticals/attributes";

function isModalKey(key: AttributeKey): boolean {
  return "modal" in ATTRIBUTES[key] && Boolean(ATTRIBUTES[key].modal);
}

const CHIP_BASE = "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50";
const CHIP_ON = "border-slate-900 bg-slate-900 text-white";
const CHIP_OFF = "border-slate-300 bg-white text-slate-700 hover:border-slate-500";
const SMALL_ON = "border-indigo-600 bg-indigo-600 text-white";
const SMALL_OFF = "border-slate-300 bg-white text-slate-600 hover:border-slate-500";

/**
 * 店舗情報の「属性」欄。その店の業態(lib/verticals/registry.ts)に合う属性だけを、押しやすいチップで並べる。
 * オンにすると、その下に詳細の入力欄が開く(選択式)。押すたびにその場で保存する。
 * チェックなしは「なし」ではなく「未設定」。公開ページにはオンの属性だけが出る(「不可」とは出ない)。
 */
export function ShopAttributesEditor({
  shopId,
  keys,
  initial,
}: {
  shopId: string;
  keys: readonly AttributeKey[];
  initial: Partial<Record<AttributeKey, AttributeDetail>>;
}) {
  const [values, setValues] = useState<Partial<Record<AttributeKey, AttributeDetail>>>(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // 選択肢が多い属性(料理など)は、チップを押すとモーダルのチェックボックスで選ぶ。
  const [modalKey, setModalKey] = useState<AttributeKey | null>(null);

  function save(key: AttributeKey, next: AttributeDetail | undefined) {
    const prev = values[key];
    setValues((v) => {
      const copy = { ...v };
      if (next) copy[key] = next;
      else delete copy[key];
      return copy;
    });
    setMessage(null);
    startTransition(async () => {
      try {
        await setShopAttribute(shopId, key, !!next, next ?? {});
        setMessage("保存しました");
      } catch (e) {
        setValues((v) => ({ ...v, [key]: prev }));
        setMessage(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  const enabled = keys.filter((k) => values[k]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {keys.map((key) => {
          const on = !!values[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              disabled={pending}
              onClick={() => ("modal" in ATTRIBUTES[key] && ATTRIBUTES[key].modal ? setModalKey(key) : save(key, on ? undefined : {}))}
              className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
            >
              <span aria-hidden>{ATTRIBUTES[key].icon}</span>
              {ATTRIBUTES[key].label.ja}
            </button>
          );
        })}
      </div>

      {enabled.filter(isModalKey).map((key) => (
        <p key={key} className="text-sm text-slate-700">
          <span aria-hidden>{ATTRIBUTES[key].icon}</span> {ATTRIBUTES[key].label.ja}:{" "}
          <span className="font-semibold">{attributeDetailSummary(key, values[key], "ja").join(" / ") || "未選択"}</span>
          <button type="button" onClick={() => setModalKey(key)} className="ml-2 text-xs font-semibold text-indigo-600 underline">変更する</button>
        </p>
      ))}

      {modalKey && (
        <ChecklistModal
          attrKey={modalKey}
          initial={values[modalKey]}
          disabled={pending}
          onClose={() => setModalKey(null)}
          onSave={(next) => {
            setModalKey(null);
            save(modalKey, next);
          }}
        />
      )}

      {enabled.some((k) => !isModalKey(k) && ATTRIBUTES[k].fields.length > 0) && (
        <div className="space-y-3">
          {enabled
            .filter((k) => !isModalKey(k) && ATTRIBUTES[k].fields.length > 0)
            .map((key) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  <span aria-hidden>{ATTRIBUTES[key].icon}</span> {ATTRIBUTES[key].label.ja}の詳細
                  <span className="ml-2 text-xs font-normal text-slate-400">わかる項目だけで大丈夫です</span>
                </p>
                <div className="mt-3 space-y-3">
                  {(ATTRIBUTES[key].fields as readonly AttributeField[]).map((field) => (
                    <DetailField
                      key={field.key}
                      field={field}
                      value={values[key]?.[field.key]}
                      disabled={pending}
                      onChange={(v) => {
                        const next = { ...(values[key] ?? {}) };
                        if (v === undefined) delete next[field.key];
                        else next[field.key] = v;
                        save(key, next);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        チェックしていない項目は「未設定」として扱われ、店舗ページに「不可」とは表示されません。オンにした項目だけが店舗ページに出ます。
      </p>
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  );
}

function DetailField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: AttributeField;
  value: AttributeDetail[string] | undefined;
  disabled: boolean;
  onChange: (v: AttributeDetail[string] | undefined) => void;
}) {
  if (field.kind === "flag") {
    const on = value === true;
    return (
      <button
        type="button"
        aria-pressed={on}
        disabled={disabled}
        onClick={() => onChange(on ? undefined : true)}
        className={`mr-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${on ? SMALL_ON : SMALL_OFF}`}
      >
        {on ? "✓ " : ""}
        {field.label.ja}
      </button>
    );
  }

  if (field.kind === "number") {
    return (
      <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
        {field.label.ja}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={field.max}
          defaultValue={typeof value === "number" ? value : ""}
          disabled={disabled}
          onBlur={(e) => {
            const n = Number(e.target.value);
            const next = e.target.value.trim() && Number.isInteger(n) && n >= 1 && n <= field.max ? n : undefined;
            if (next !== value) onChange(next);
          }}
          className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-900 focus:border-slate-500 focus:outline-none"
        />
        <span className="font-normal text-slate-500">{field.unit.ja}</span>
      </label>
    );
  }

  const selected = field.kind === "multi" ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600">
        {field.label.ja}
        {field.kind === "multi" && <span className="ml-1 font-normal text-slate-400">(複数選べます)</span>}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {field.options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => {
                if (field.kind === "single") return onChange(on ? undefined : o.value);
                const list = on ? selected.filter((v) => v !== o.value) : [...selected, o.value];
                onChange(list.length ? list : undefined);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${on ? SMALL_ON : SMALL_OFF}`}
            >
              {o.label.ja}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 選択肢が多い属性用。チェックボックスで複数選び、「決定」で保存する(全部外して決定すると、その属性はオフに戻る)。 */
function ChecklistModal({
  attrKey,
  initial,
  disabled,
  onClose,
  onSave,
}: {
  attrKey: AttributeKey;
  initial: AttributeDetail | undefined;
  disabled: boolean;
  onClose: () => void;
  onSave: (next: AttributeDetail | undefined) => void;
}) {
  const field = (ATTRIBUTES[attrKey].fields as readonly AttributeField[]).find((f) => f.kind === "multi");
  const [selected, setSelected] = useState<string[]>(() => {
    const v = field ? initial?.[field.key] : undefined;
    return Array.isArray(v) ? v : [];
  });
  if (!field || field.kind !== "multi") return null;
  const multi = field;
  function toggle(value: string) {
    setSelected((list) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]));
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={ATTRIBUTES[attrKey].label.ja} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-base font-bold text-slate-900"><span aria-hidden>{ATTRIBUTES[attrKey].icon}</span> {ATTRIBUTES[attrKey].label.ja}を選ぶ</p>
          <p className="mt-1 text-xs text-slate-500">当てはまるものをすべてチェックしてください(複数選べます)。お客様の検索やAIの案内に使われます。</p>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-1 overflow-y-auto px-3 py-3 sm:grid-cols-2">
          {multi.options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-800 hover:bg-slate-50">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="h-5 w-5 rounded border-slate-300 accent-indigo-600" />
              {o.label.ja}
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-500">{selected.length}個選択中</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">キャンセル</button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSave(selected.length ? { [multi.key]: multi.options.map((o) => o.value).filter((v) => selected.includes(v)) } : undefined)}
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              決定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
