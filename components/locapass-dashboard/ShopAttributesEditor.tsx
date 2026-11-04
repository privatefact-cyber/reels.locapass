"use client";

import { useState, useTransition } from "react";
import { setShopAttribute } from "@/app/dashboard/shop/[shopId]/actions";
import { ATTRIBUTES, type AttributeDetail, type AttributeField, type AttributeKey } from "@/lib/verticals/attributes";

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
              onClick={() => save(key, on ? undefined : {})}
              className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
            >
              <span aria-hidden>{ATTRIBUTES[key].icon}</span>
              {ATTRIBUTES[key].label.ja}
            </button>
          );
        })}
      </div>

      {enabled.some((k) => ATTRIBUTES[k].fields.length > 0) && (
        <div className="space-y-3">
          {enabled
            .filter((k) => ATTRIBUTES[k].fields.length > 0)
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
