"use client";

import { useState } from "react";

interface PriceItemRow {
  id: string;
  name: string;
  duration_minutes: number | null;
  price: number;
}

export function PriceListSection({
  priceItems,
  addPriceItem,
  updatePriceItem,
  deletePriceItem,
}: {
  priceItems: PriceItemRow[];
  addPriceItem: (formData: FormData) => Promise<void>;
  updatePriceItem: (itemId: string, formData: FormData) => Promise<void>;
  deletePriceItem: (itemId: string) => Promise<void>;
}) {
  const [editingItem, setEditingItem] = useState<PriceItemRow | null>(null);
  const [key, setKey] = useState(0);

  async function handleSubmit(formData: FormData) {
    if (editingItem) {
      await updatePriceItem(editingItem.id, formData);
      setEditingItem(null);
    } else {
      await addPriceItem(formData);
    }
    setKey((k) => k + 1);
  }

  function startEdit(item: PriceItemRow) {
    setEditingItem(item);
    setKey((k) => k + 1);
  }

  function cancelEdit() {
    setEditingItem(null);
    setKey((k) => k + 1);
  }

  return (
    <section id="shop-price" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">料金表</h2>
      {priceItems.length > 0 && (
        <ul className="mb-4 divide-y divide-black/10">
          {priceItems.map((item) => (
            <li
              key={item.id}
              className={`flex items-center justify-between py-2 text-sm ${
                editingItem?.id === item.id ? "bg-slate-50" : ""
              }`}
            >
              <span>
                {item.name}
                {item.duration_minutes ? `(${item.duration_minutes}分)` : ""}
              </span>
              <div className="flex items-center gap-3">
                <span>¥{item.price.toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="text-xs text-slate-400 hover:text-slate-700"
                >
                  編集
                </button>
                <form action={deletePriceItem.bind(null, item.id)}>
                  <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                    削除
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingItem && (
        <p className="mb-2 text-xs font-semibold text-slate-700">「{editingItem.name}」を編集中</p>
      )}
      <form key={key} action={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input
          name="name"
          required
          defaultValue={editingItem?.name ?? ""}
          placeholder="コース名"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <input
          name="duration_minutes"
          type="number"
          defaultValue={editingItem?.duration_minutes ?? ""}
          placeholder="時間(分)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <input
          name="price"
          type="number"
          required
          defaultValue={editingItem?.price ?? ""}
          placeholder="料金(円)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            {editingItem ? "更新" : "追加"}
          </button>
          {editingItem && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              取消
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
