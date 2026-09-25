"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function ShopAccordion({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-line/20 bg-panel-900/60 shadow-2xl backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-hl-100">
          {icon}
          {title}
        </h2>
        <ChevronDown
          size={18}
          className={`text-hl-400/70 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-line/10 px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
