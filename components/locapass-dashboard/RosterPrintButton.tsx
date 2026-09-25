"use client";

export function RosterPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-main hover:bg-slate-800 print:hidden"
    >
      PDFとして保存・印刷
    </button>
  );
}
