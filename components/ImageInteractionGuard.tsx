"use client";
import { useEffect } from "react";
export function ImageInteractionGuard() {
  useEffect(() => {
    const imageTarget = (target: EventTarget | null) => target instanceof HTMLImageElement;
    const blockMenu = (event: MouseEvent) => { if (imageTarget(event.target)) event.preventDefault(); };
    const blockDrag = (event: DragEvent) => { if (imageTarget(event.target)) event.preventDefault(); };
    document.addEventListener("contextmenu", blockMenu, true);
    document.addEventListener("dragstart", blockDrag, true);
    return () => { document.removeEventListener("contextmenu", blockMenu, true); document.removeEventListener("dragstart", blockDrag, true); };
  }, []);
  return null;
}
