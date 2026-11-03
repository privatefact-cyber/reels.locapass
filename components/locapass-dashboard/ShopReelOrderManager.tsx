"use client";

import { useState, useTransition } from "react";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pin } from "lucide-react";
import { StreamThumb } from "@/components/video/StreamThumb";
import { saveShopReelOrder } from "@/app/dashboard/shop/[shopId]/actions";
import { MAX_SHOP_PINNED_REELS } from "@/lib/reels/shopOrder";

export type OrderItem = { id: string; type: "video" | "image"; url: string; label: string; pinned: boolean };

function Tile({ item, onTogglePin }: { item: OrderItem; onTogglePin: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, touchAction: "none" }}
      className={`relative aspect-[9/16] cursor-grab overflow-hidden rounded-lg border bg-slate-50 ${
        item.pinned ? "border-amber-500 ring-2 ring-amber-400" : "border-slate-200"
      } ${isDragging ? "z-10 opacity-70 shadow-lg" : ""}`}
      {...attributes}
      {...listeners}
    >
      {item.type === "video" ? (
        <StreamThumb url={item.url} className="pointer-events-none h-full w-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
      )}
      <p className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[10px] text-white">
        {item.label}
      </p>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onTogglePin(item.id)}
        className={`absolute right-1 top-1 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          item.pinned ? "bg-amber-500 text-black" : "bg-black/70 text-white hover:bg-black"
        }`}
      >
        <Pin size={10} className={item.pinned ? "fill-black" : ""} /> {item.pinned ? "固定中" : "固定"}
      </button>
    </div>
  );
}

/** 店舗詳細ページに出るリールの並び替え(ドラッグ)とピン留め(最大10件)。保存しても一覧・フィードの並びは変わらない。 */
export function ShopReelOrderManager({ shopId, initial }: { shopId: string; initial: OrderItem[] }) {
  const [items, setItems] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  // ピン留めは常に先頭グループ(順番は保つ)。
  const normalize = (list: OrderItem[]) => [...list.filter((i) => i.pinned), ...list.filter((i) => !i.pinned)];

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === active.id);
      const to = prev.findIndex((i) => i.id === over.id);
      return normalize(arrayMove(prev, from, to));
    });
    setDirty(true);
    setMsg(null);
  }

  function togglePin(id: string) {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    if (!target.pinned && items.filter((i) => i.pinned).length >= MAX_SHOP_PINNED_REELS) {
      setMsg(`ピン留めは最大${MAX_SHOP_PINNED_REELS}件までです`);
      return;
    }
    setItems((prev) => normalize(prev.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i))));
    setDirty(true);
    setMsg(null);
  }

  function save() {
    startTransition(async () => {
      try {
        await saveShopReelOrder(
          shopId,
          items.map((i) => i.id),
          items.filter((i) => i.pinned).map((i) => i.id),
        );
        setDirty(false);
        setMsg("保存しました。店舗ページに反映されます。");
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "保存に失敗しました");
      }
    });
  }

  const pinnedCount = items.filter((i) => i.pinned).length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">店舗ページの並び順</h2>
      <p className="mt-1 text-xs text-slate-500">
        動画をドラッグ(スマホは長押ししてから移動)すると、店舗詳細ページの並びが変わります。「固定」を押した動画は先頭に固定されます(最大{MAX_SHOP_PINNED_REELS}件・いま{pinnedCount}件)。
        リール一覧やフィードの並びは変わりません。
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7">
            {items.map((i) => (
              <Tile key={i.id} item={i} onTogglePin={togglePin} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {pending ? "保存中..." : "並び順を保存"}
        </button>
        {msg && <span className="text-xs text-slate-600">{msg}</span>}
      </div>
    </section>
  );
}
